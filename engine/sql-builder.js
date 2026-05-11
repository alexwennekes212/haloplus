import tablesData from '../schema/tables.json' assert { type: 'json' };
import joinsData from '../schema/joins.json' assert { type: 'json' };
import variablesData from '../schema/variables.json' assert { type: 'json' };

class HaloSQLBuilder {
  constructor() {
    this.tables = tablesData;
    this.joins = joinsData.joins;
    this.variables = variablesData.variables;
    this.reset();
  }

  reset() {
    this.selectedTable = null;
    this.selectedColumns = [];
    this.joinedTables = [];
    this.conditions = [];
    this.orderBy = [];
    this.topN = null;
    this.groupBy = [];
    this.aggregates = [];
  }

  getTableList() {
    return Object.entries(this.tables).map(([key, table]) => ({
      id: key,
      label: table.label,
      alias: table.alias,
      description: table.description
    }));
  }

  getColumnsForTable(tableId) {
    const table = this.tables[tableId];
    if (!table) return [];
    return Object.entries(table.columns).map(([colName, col]) => ({
      name: colName,
      label: col.label,
      type: col.type,
      isPk: col.pk || false,
      hasFk: !!col.fk,
      fk: col.fk || null
    }));
  }

  getRelatedTables(tableId) {
    return this.joins
      .filter(j => j.from.table === tableId || j.to.table === tableId)
      .map(j => {
        const isFrom = j.from.table === tableId;
        const relatedTable = isFrom ? j.to.table : j.from.table;
        return {
          table: relatedTable,
          label: this.tables[relatedTable]?.label || relatedTable,
          joinLabel: j.label,
          fromCol: j.from.column,
          toCol: j.to.column,
          type: j.type
        };
      });
  }

  getAvailableVariables() {
    return Object.entries(this.variables).map(([name, v]) => ({
      name,
      label: v.label,
      description: v.description,
      contexts: v.contexts
    }));
  }

  setBaseTable(tableId) {
    this.selectedTable = tableId;
    return this;
  }

  addColumn(tableId, columnName, alias = null, aggregate = null) {
    this.selectedColumns.push({ tableId, columnName, alias, aggregate });
    if (tableId !== this.selectedTable) {
      this._ensureJoin(tableId);
    }
    return this;
  }

  addCondition(tableId, columnName, operator, value) {
    this.conditions.push({ tableId, columnName, operator, value });
    if (tableId !== this.selectedTable) {
      this._ensureJoin(tableId);
    }
    return this;
  }

  addOrderBy(tableId, columnName, direction = 'ASC') {
    this.orderBy.push({ tableId, columnName, direction });
    return this;
  }

  setTop(n) {
    this.topN = n;
    return this;
  }

  addGroupBy(tableId, columnName) {
    this.groupBy.push({ tableId, columnName });
    return this;
  }

  _ensureJoin(tableId) {
    if (this.joinedTables.find(j => j.table === tableId)) return;

    const join = this.joins.find(j =>
      (j.from.table === this.selectedTable && j.to.table === tableId) ||
      (j.to.table === this.selectedTable && j.from.table === tableId)
    );

    if (join) {
      const isFromBase = join.from.table === this.selectedTable;
      this.joinedTables.push({
        table: tableId,
        baseCol: isFromBase ? join.from.column : join.to.column,
        joinCol: isFromBase ? join.to.column : join.from.column,
        type: join.type
      });
    }
  }

  _getAlias(tableId) {
    const table = this.tables[tableId];
    return table?.alias || tableId;
  }

  _qualifyColumn(tableId, columnName) {
    const alias = this._getAlias(tableId);
    const colDef = this.tables[tableId]?.columns?.[columnName];
    const isNtext = colDef && (colDef.type === 'ntext' || colDef.type === 'ntext');

    if (isNtext) {
      return `CONVERT(nvarchar(max), ${alias}.${columnName})`;
    }
    return `${alias}.${columnName}`;
  }

  build() {
    if (!this.selectedTable) return '';

    const parts = [];

    let selectClause = 'SELECT';
    if (this.topN) selectClause += ` TOP ${this.topN}`;
    parts.push(selectClause);

    if (this.selectedColumns.length === 0) {
      parts.push(`  *`);
    } else {
      const cols = this.selectedColumns.map((col, i) => {
        let expr = this._qualifyColumn(col.tableId, col.columnName);

        if (col.aggregate) {
          expr = `${col.aggregate}(${expr})`;
        }

        if (col.alias) {
          expr += ` AS [${col.alias}]`;
        }

        const comma = i < this.selectedColumns.length - 1 ? ',' : '';
        return `  ${expr}${comma}`;
      });
      parts.push(cols.join('\n'));
    }

    const baseAlias = this._getAlias(this.selectedTable);
    parts.push(`FROM`);
    parts.push(`  ${this.selectedTable} ${baseAlias}`);

    for (const join of this.joinedTables) {
      const joinAlias = this._getAlias(join.table);
      const joinType = join.type === 'one-to-one' ? 'INNER JOIN' : 'LEFT JOIN';
      parts.push(`  ${joinType} ${join.table} ${joinAlias} ON ${baseAlias}.${join.baseCol} = ${joinAlias}.${join.joinCol}`);
    }

    if (this.conditions.length > 0) {
      parts.push(`WHERE`);
      this.conditions.forEach((cond, i) => {
        const prefix = i === 0 ? '  ' : '  AND ';
        const col = this._qualifyColumn(cond.tableId, cond.columnName);
        const condition = this._formatCondition(col, cond.operator, cond.value);
        parts.push(`${prefix}${condition}`);
      });
    }

    if (this.groupBy.length > 0) {
      const groupCols = this.groupBy.map(g => this._qualifyColumn(g.tableId, g.columnName));
      parts.push(`GROUP BY`);
      parts.push(`  ${groupCols.join(', ')}`);
    }

    if (this.orderBy.length > 0) {
      const orderCols = this.orderBy.map(o =>
        `${this._qualifyColumn(o.tableId, o.columnName)} ${o.direction}`
      );
      parts.push(`ORDER BY`);
      parts.push(`  ${orderCols.join(', ')}`);
    }

    return parts.join('\n');
  }

  _formatCondition(column, operator, value) {
    if (value === null || value === 'NULL') {
      return `${column} ${operator === '!=' || operator === '<>' ? 'IS NOT NULL' : 'IS NULL'}`;
    }
    return `${column} ${operator} ${this._formatValue(value, operator)}`;
  }

  _formatValue(value, operator) {
    if (value === null || value === 'NULL') {
      return 'NULL';
    }
    if (typeof value === 'string' && value.startsWith('$')) {
      return value; // Halo pseudo-variable
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (operator === 'IN') {
      return value; // Assumes already formatted as (val1, val2)
    }
    if (operator === 'LIKE') {
      return `'%${value}%'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}

export default HaloSQLBuilder;
