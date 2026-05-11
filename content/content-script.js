/**
 * HaloPlus content script.
 * Adds in-page utilities on Halo: command palette, recent records,
 * field API overlays, JSON inspector, and report-query execution for the side panel.
 */

(function () {
  'use strict';

  const HU = {
    paletteOpen: false,
    fieldOverlayOn: false,
    jsonInspectorOpen: false,
    paletteResults: [],
    paletteGrouped: false,
    paletteShowAll: false,
    selectedIndex: 0,
    searchTimer: null,
    tableScanTimer: null,
    lastTrackedUrl: '',
    shortcuts: [],
    customCommands: [],
    recentCommands: [],
    ticketTypeCommands: [],
    ticketTypeSearchMap: {},
    schemaColumnCache: {},
    impersonatedAgentId: '',
    suppressSlashUntil: 0,
    ticket360TicketId: 0,
    timelineTicketId: 0,
    theme: 'light',
    settings: { auto360: false, drawer360Push: false, hideHaloSidebar: false },
    palette: { placement: 'mid', fontScale: 1 },
    _hidHaloMenu: false
  };

  const ROUTES = {
    ticket:   { list: '/tickets?area=1',             detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    problem:  { list: '/tickets?area=2',              detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    change:   { list: '/tickets?area=3',              detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    request:  { list: '/tickets?area=4',              detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    project:  { list: '/tickets?area=7',              detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    hr:       { list: '/tickets?area=8',              detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    facility: { list: '/tickets?area=9',              detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    draft:    { list: '/tickets?area=10',             detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    mywork:   { list: '/tickets?area=12',             detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    major:    { list: '/tickets?area=13',             detail: id => `/tickets?id=${encodeURIComponent(id)}` },
    customer: { list: '/customers',                  detail: id => `/customers?clientid=${encodeURIComponent(id)}` },
    site:     { list: '/customers?mainview=site',   detail: id => `/customers?mainview=site&siteid=${encodeURIComponent(id)}` },
    agent:    { list: '/config/agents/agents',       detail: id => `/config/agents/agents?agentid=${encodeURIComponent(id)}` },
    user:     { list: '/customers?mainview=user',   detail: id => `/customers?mainview=user&userid=${encodeURIComponent(id)}` },
    team:     { list: '/config/agents/teams',       detail: id => `/config/agents/teams?teamid=${encodeURIComponent(id)}` },
    asset:    { list: '/assets',                    detail: id => `/assets?id=${encodeURIComponent(id)}` },
    kb:       { list: '/kb',                        detail: id => `/kb?id=${encodeURIComponent(id)}` },
    report:   { list: '/reports?mainview=reportgroup', detail: id => `/reports?id=${encodeURIComponent(id)}` },
    config:   { list: '/config',                     detail: id => `/config?selid=${encodeURIComponent(id)}` }
  };

  const API_RESOURCES = [
    { category: 'Tickets & ITSM', endpoints: [
      { path: '/api/tickets',         methods: 'GET POST',        desc: 'List, search and create tickets / incidents' },
      { path: '/api/tickets/{id}',    methods: 'GET PUT DELETE',  desc: 'Get, update or delete a ticket' },
      { path: '/api/actions',         methods: 'GET POST',        desc: 'Ticket actions - notes, emails, replies' },
      { path: '/api/actions/{id}',    methods: 'GET PUT DELETE',  desc: 'Get, update or delete an action' },
      { path: '/api/statuses',        methods: 'GET',             desc: 'List ticket statuses' },
      { path: '/api/priority',        methods: 'GET',             desc: 'List ticket priorities' },
      { path: '/api/requesttype',     methods: 'GET',             desc: 'List request / ticket types' },
      { path: '/api/sla',             methods: 'GET',             desc: 'List SLA policies' }
    ]},
    { category: 'Problems & Changes', endpoints: [
      { path: '/api/problems',        methods: 'GET POST',        desc: 'List and create problem records' },
      { path: '/api/problems/{id}',   methods: 'GET PUT DELETE',  desc: 'Manage a problem record' },
      { path: '/api/changes',         methods: 'GET POST',        desc: 'List and create change requests' },
      { path: '/api/changes/{id}',    methods: 'GET PUT DELETE',  desc: 'Manage a change request' },
      { path: '/api/releases',        methods: 'GET POST',        desc: 'List and create releases' },
      { path: '/api/releases/{id}',   methods: 'GET PUT DELETE',  desc: 'Manage a release' }
    ]},
    { category: 'Customers & People', endpoints: [
      { path: '/api/client',          methods: 'GET POST',        desc: 'List and create customers / clients' },
      { path: '/api/client/{id}',     methods: 'GET PUT DELETE',  desc: 'Manage a customer record' },
      { path: '/api/users',           methods: 'GET POST',        desc: 'List and create end-user contacts' },
      { path: '/api/users/{id}',      methods: 'GET PUT DELETE',  desc: 'Manage a user contact' },
      { path: '/api/agent',           methods: 'GET POST',        desc: 'List and create agents / technicians' },
      { path: '/api/agent/{id}',      methods: 'GET PUT',         desc: 'Manage an agent record' },
      { path: '/api/team',            methods: 'GET POST',        desc: 'List agent teams' },
      { path: '/api/site',            methods: 'GET POST',        desc: 'List and create sites / locations' },
      { path: '/api/site/{id}',       methods: 'GET PUT DELETE',  desc: 'Manage a site record' }
    ]},
    { category: 'Assets', endpoints: [
      { path: '/api/asset',           methods: 'GET POST',        desc: 'List and create assets / CIs' },
      { path: '/api/asset/{id}',      methods: 'GET PUT DELETE',  desc: 'Manage an asset record' },
      { path: '/api/assettype',       methods: 'GET',             desc: 'List asset types' },
      { path: '/api/softwarelicence', methods: 'GET POST',        desc: 'Manage software licences' }
    ]},
    { category: 'Knowledge Base', endpoints: [
      { path: '/api/kbentry',         methods: 'GET POST',        desc: 'List and create KB articles' },
      { path: '/api/kbentry/{id}',    methods: 'GET PUT DELETE',  desc: 'Manage a KB article' }
    ]},
    { category: 'Projects', endpoints: [
      { path: '/api/projects',        methods: 'GET POST',        desc: 'List and create projects' },
      { path: '/api/projects/{id}',   methods: 'GET PUT DELETE',  desc: 'Manage a project' },
      { path: '/api/projecttask',     methods: 'GET POST',        desc: 'Manage project tasks' }
    ]},
    { category: 'Finance', endpoints: [
      { path: '/api/invoice',         methods: 'GET POST',        desc: 'List and create invoices' },
      { path: '/api/invoice/{id}',    methods: 'GET PUT DELETE',  desc: 'Manage an invoice' },
      { path: '/api/quotation',       methods: 'GET POST',        desc: 'List and create quotes' },
      { path: '/api/quotation/{id}',  methods: 'GET PUT DELETE',  desc: 'Manage a quote' },
      { path: '/api/purchaseorder',   methods: 'GET POST',        desc: 'List and create purchase orders' },
      { path: '/api/supplier',        methods: 'GET POST',        desc: 'List and create suppliers' }
    ]},
    { category: 'Config & Reporting', endpoints: [
      { path: '/api/Report',          methods: 'POST',            desc: 'Run a custom SQL report query' },
      { path: '/api/dashboard',       methods: 'GET',             desc: 'List dashboards' },
      { path: '/api/customfield',     methods: 'GET',             desc: 'List custom field definitions' },
      { path: '/api/department',      methods: 'GET POST',        desc: 'List and create departments' },
      { path: '/api/category',        methods: 'GET',             desc: 'List categories / ticket categories' }
    ]}
  ];

  const BASE_COMMANDS = [
    // ITSM navigation
    navCommand('t',          'Tickets',           'Open the incident / ticket list',       routeList('ticket'),   ['incidents', 'tickets', 'calls'],           'ITSM'),
    navCommand('prob',       'Problems',          'Open the problem list',                 routeList('problem'),  ['problems', 'problem management', 'PIR'],    'ITSM'),
    navCommand('chg',        'Changes',           'Open the change request list',          routeList('change'),   ['changes', 'change management', 'RFC'],      'ITSM'),
    navCommand('req',        'Requests',          'Open the request ticket list',          routeList('request'),  ['requests', 'service requests'],            'ITSM'),
    navCommand('hr',         'HR',                'Open the HR ticket area',               routeList('hr'),       ['human resources'],                         'ITSM'),
    navCommand('fac',        'Facilities',        'Open the facilities ticket area',       routeList('facility'), ['facilities', 'facility', 'building'],      'ITSM'),
    navCommand('dft',        'Draft Articles',    'Open the draft articles ticket area',   routeList('draft'),    ['article drafts', 'drafts'],                'ITSM'),
    navCommand('mw',         'My Work',           'Open the My Work ticket area',          routeList('mywork'),   ['my work', 'worklist', 'my tickets'],       'ITSM'),
    navCommand('mi',         'Major Incidents',   'Open the major incidents ticket area',  routeList('major'),    ['major incidents', 'major incident'],       'ITSM'),
    // People
    navCommand('c',          'Customers',         'Open customers / clients',              routeList('customer'), ['customers', 'clients', 'organisations', 'organizations'],'People'),
    navCommand('a',          'Agents',            'Open agents / technicians',             routeList('agent'),    ['agents', 'technicians', 'staff'],          'People'),
    navCommand('u',          'Users',             'Open end-user contacts',                routeList('user'),     ['users', 'contacts', 'end users'],          'People'),
    navCommand('team',       'Teams',             'Open agent teams',                      routeList('team'),     ['teams', 'groups'],                         'People'),
    navCommand('s',          'Sites',             'Open sites and locations',              routeList('site'),     ['sites', 'locations', 'offices', 'branches'],'People'),
    // Assets & Knowledge
    navCommand('asset',      'Assets',            'Open the asset / CI list',              routeList('asset'),    ['assets', 'devices', 'CIs', 'hardware', 'inventory'], 'Assets'),
    navCommand('kb',         'Knowledge Base',    'Open the knowledge base',               routeList('kb'),       ['articles', 'FAQ', 'knowledgebase'],        'Knowledge'),
    // Projects
    navCommand('prj',        'Projects',          'Open the project ticket area',          routeList('project'),  ['projects', 'project management'],          'Projects'),
    // Config & Reports
    navCommand('cfg',        'Configuration',     'Open Halo configuration',               '/config',             ['config', 'settings', 'admin', 'setup'],     'Config'),
    navCommand('rep',        'Reports',           'Open reports',                          '/reports?mainview=reportgroup', ['reports', 'reporting', 'sql', 'analytics'], 'Config'),
    // Commands
    command('r',             'Recent records',    'Open the last 20 Halo records you visited', showRecentPanel,       ['recent', 'history', 'jump back']),
    command('360',           'Ticket 360',        'Open a full ticket context panel for the current ticket', openTicket360Panel, ['ticket360', 'ticket context', 'ticket summary', 'overview']),
    command('tl',            'Action timeline',   'Show recent actions and communication for the current ticket', openActionTimelinePanel, ['timeline', 'actions', 'history', 'updates']),
    command('f',             'Toggle field API names', 'Show or hide API names beside form labels', toggleFieldOverlay, ['fields', 'api names', 'field overlay']),
    command('j',             'Inspect record JSON', 'Open raw record data and copy to clipboard', openJsonInspector,   ['json', 'payload', 'raw', 'api']),
    command('api',           'API reference',     'Browse all Halo REST API endpoints',    showApiReference,      ['rest', 'endpoints', 'developer', 'docs']),
    command('imp',           'Impersonate agent', 'Type /imp followed by an agent name or ID', runImpersonationCommand, ['act as', 'switch user', 'agent']),
    command('xi',            'Exit impersonation','Switch back from the impersonated Halo session', exitImpersonation, ['exitimp', 'switchback', 'stop impersonating']),
    command('h',             'HaloPlus help',    'Show command palette tips and available commands', showHelpPanel,   ['help', 'keyboard', 'shortcuts', 'commands']),
    command('sc',            'Add shortcut',      'Save this page as a palette shortcut',  addCurrentPageShortcut,['shortcut', 'favorite', 'bookmark']),
    command('rs',            'Reload shortcuts',  'Refresh user-defined shortcuts from storage', loadShortcuts,   ['reload shortcuts', 'refresh'])
  ];

  const COMMAND_ALIASES = {
    i: 't'
  };

  const ENTITY_COMMAND_IDS = {
    t: 't',
    i: 't',
    prob: 'prob',
    chg: 'chg',
    req: 'req',
    hr: 'hr',
    fac: 'fac',
    dft: 'dft',
    mw: 'mw',
    mi: 'mi',
    prj: 'prj',
    c: 'c',
    a: 'a',
    u: 'u',
    s: 's',
    team: 'team',
    k: 'kb',
    kb: 'kb',
    asset: 'asset',
    inv: 'invoices',
    q: 'quotes',
    po: 'purchases',
    rep: 'rep'
  };
  // Maps command keywords to the entity search and navigation definition.
  const ENTITY_SEARCH_MAP = {
    incident:  { commandId: 'incidents', kind: 'Ticket',     route: 'ticket',   table: 'faults',  id: 'Faultid',  title: 'Symptom',   sub: 'Username',  extraCols: ['AAreaDesc'],                                          searchCols: ['Symptom', 'Username'], optionalSearchCols: ['Symptom2', 'FDescription'], ticketPrefix: 'INC' },
    incidents: { commandId: 'incidents', kind: 'Ticket',     route: 'ticket',   table: 'faults',  id: 'Faultid',  title: 'Symptom',   sub: 'Username',  extraCols: ['AAreaDesc'],                                          searchCols: ['Symptom', 'Username'], optionalSearchCols: ['Symptom2', 'FDescription'], ticketPrefix: 'INC' },
    ticket:    { commandId: 'incidents', kind: 'Ticket',     route: 'ticket',   table: 'faults',  id: 'Faultid',  title: 'Symptom',   sub: 'Username',  extraCols: ['AAreaDesc'],                                          searchCols: ['Symptom', 'Username'], optionalSearchCols: ['Symptom2', 'FDescription'], ticketPrefix: 'INC' },
    tickets:   { commandId: 'incidents', kind: 'Ticket',     route: 'ticket',   table: 'faults',  id: 'Faultid',  title: 'Symptom',   sub: 'Username',  extraCols: ['AAreaDesc'],                                          searchCols: ['Symptom', 'Username'], optionalSearchCols: ['Symptom2', 'FDescription'], ticketPrefix: 'INC' },
    customer:  { commandId: 'customers', kind: 'Customer',   route: 'customer', table: 'area',    id: 'AArea',    title: 'AAreaDesc', sub: '\'\'',     extraCols: [],                                                     searchCols: ['AAreaDesc'], optionalSearchCols: ['AMemo'], combineWith: ['user'] },
    customers: { commandId: 'customers', kind: 'Customer',   route: 'customer', table: 'area',    id: 'AArea',    title: 'AAreaDesc', sub: '\'\'',     extraCols: [],                                                     searchCols: ['AAreaDesc'], optionalSearchCols: ['AMemo'], combineWith: ['user'] },
    agent:     { commandId: 'agents',    kind: 'Agent',      route: 'agent',    table: 'uname',   id: 'UNum',     title: 'UName',     sub: 'USMTP',     extraCols: [],                                                     searchCols: ['UName', 'USMTP'] },
    agents:    { commandId: 'agents',    kind: 'Agent',      route: 'agent',    table: 'uname',   id: 'UNum',     title: 'UName',     sub: 'USMTP',     extraCols: [],                                                     searchCols: ['UName', 'USMTP'] },
    user:      { commandId: 'customers', kind: 'End user',   route: 'user',     table: 'users',   id: 'uid',      title: 'UUsername', sub: 'UEmail',    extraCols: [],                                                     searchCols: ['UUsername', 'UEmail'], combineWith: ['customer'] },
    users:     { commandId: 'customers', kind: 'End user',   route: 'user',     table: 'users',   id: 'uid',      title: 'UUsername', sub: 'UEmail',    extraCols: [],                                                     searchCols: ['UUsername', 'UEmail'], combineWith: ['customer'] },
    asset:     { commandId: 'assets',    kind: 'Asset',      route: 'asset',    table: 'device',  id: 'DID',      title: 'DInvNo',    sub: 'DID',       extraCols: [],                                                     searchCols: ['DInvNo'], optionalSearchCols: ['DDesc'] },
    assets:    { commandId: 'assets',    kind: 'Asset',      route: 'asset',    table: 'device',  id: 'DID',      title: 'DInvNo',    sub: 'DID',       extraCols: [],                                                     searchCols: ['DInvNo'], optionalSearchCols: ['DDesc'] },
    kb:        { commandId: 'kb',        kind: 'KB Article', route: 'kb',       table: 'kbentry', id: 'id',       title: 'Abstract',  sub: '\'\'',     extraCols: [],                                                     searchCols: ['Abstract'], optionalSearchCols: ['Description', 'Resolution'] },
    knowledge: { commandId: 'kb',        kind: 'KB Article', route: 'kb',       table: 'kbentry', id: 'id',       title: 'Abstract',  sub: '\'\'',     extraCols: [],                                                     searchCols: ['Abstract'], optionalSearchCols: ['Description', 'Resolution'] },
    invoice:   { commandId: 'invoices',  kind: 'Invoice',    route: 'invoice',  table: 'invoiceheader', id: 'ihid', title: 'IH3rdPartyInvoiceNumber', sub: 'IHname', searchCols: ['IH3rdPartyInvoiceNumber', 'IHname'] },
    invoices:  { commandId: 'invoices',  kind: 'Invoice',    route: 'invoice',  table: 'invoiceheader', id: 'ihid', title: 'IH3rdPartyInvoiceNumber', sub: 'IHname', searchCols: ['IH3rdPartyInvoiceNumber', 'IHname'] },
    quote:     { commandId: 'quotes',    kind: 'Quote',      route: 'quote',    table: 'quotationheader', id: 'qhid', title: 'QHtitle', sub: 'QHPORef', searchCols: ['QHtitle', 'QHPORef'] },
    quotes:    { commandId: 'quotes',    kind: 'Quote',      route: 'quote',    table: 'quotationheader', id: 'qhid', title: 'QHtitle', sub: 'QHPORef', searchCols: ['QHtitle', 'QHPORef'] },
    purchase:  { commandId: 'purchases', kind: 'Purchase Order', route: 'purchase', table: 'supplierorderheader', id: 'SHid', title: 'SHtitle', sub: 'SHPORef', searchCols: ['SHtitle', 'SHPORef'] },
    purchases: { commandId: 'purchases', kind: 'Purchase Order', route: 'purchase', table: 'supplierorderheader', id: 'SHid', title: 'SHtitle', sub: 'SHPORef', searchCols: ['SHtitle', 'SHPORef'] },
    po:        { commandId: 'purchases', kind: 'Purchase Order', route: 'purchase', table: 'supplierorderheader', id: 'SHid', title: 'SHtitle', sub: 'SHPORef', searchCols: ['SHtitle', 'SHPORef'] }
  };

  Object.assign(ENTITY_SEARCH_MAP, {
    i: ENTITY_SEARCH_MAP.incident,
    t: ENTITY_SEARCH_MAP.ticket,
    prob: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'prob', kind: 'Problem', ticketPrefix: 'PRB' },
    chg: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'chg', kind: 'Change', ticketPrefix: 'CHG' },
    req: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'req', kind: 'Request', ticketPrefix: 'REQ' },
    hr: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'hr', kind: 'HR', ticketPrefix: 'HR', sectionMatch: ['hr', 'human resource'] },
    fac: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'fac', kind: 'Facilities', ticketPrefix: 'FAC', sectionMatch: ['facilit'] },
    dft: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'dft', kind: 'Draft Article', ticketPrefix: 'DFT' },
    mw: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'mw', kind: 'My Work', ticketPrefix: 'MW' },
    mi: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'mi', kind: 'Major Incident', ticketPrefix: 'MI' },
    prj: { ...ENTITY_SEARCH_MAP.ticket, commandId: 'prj', kind: 'Project', ticketPrefix: 'PRJ' },
    c: ENTITY_SEARCH_MAP.customer,
    a: ENTITY_SEARCH_MAP.agent,
    u: ENTITY_SEARCH_MAP.user,
    k: ENTITY_SEARCH_MAP.kb,
    inv: ENTITY_SEARCH_MAP.invoice,
    q: ENTITY_SEARCH_MAP.quote,
    site: { commandId: 'sites', kind: 'Site', route: 'site', table: 'site', id: 'SSitenum', title: 'SDesc', sub: 'ISNULL((SELECT AAreaDesc FROM area WHERE AArea = site.SArea), \'\')', searchCols: ['SDesc'] },
    sites: { commandId: 'sites', kind: 'Site', route: 'site', table: 'site', id: 'SSitenum', title: 'SDesc', sub: 'ISNULL((SELECT AAreaDesc FROM area WHERE AArea = site.SArea), \'\')', searchCols: ['SDesc'] },
    s: { commandId: 'sites', kind: 'Site', route: 'site', table: 'site', id: 'SSitenum', title: 'SDesc', sub: 'ISNULL((SELECT AAreaDesc FROM area WHERE AArea = site.SArea), \'\')', searchCols: ['SDesc'] }
    ,
    team: { commandId: 'team', kind: 'Team', route: 'team', table: 'sectiondetail', id: 'SDid', title: 'SDSectionName', sub: 'SDDepartmentid', searchCols: ['SDSectionName'] },
    rep: { commandId: 'rep', kind: 'Report', route: 'report', table: 'report', id: 'rid', title: 'rname', sub: 'rdesc', searchCols: ['rname', 'rdesc'] }
  });
  function command(id, title, subtitle, run, keywords = [], kind = '') {
    return { id, title, subtitle, run, keywords, type: 'command', kind };
  }

  function safeNavUrl(value) {
    if (!value) return '';
    try {
      const resolved = new URL(value, window.location.origin);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return '';
      return resolved.href;
    } catch (e) {
      return '';
    }
  }

  function navigateTo(value) {
    const href = safeNavUrl(value);
    if (href) window.location.assign(href);
  }

  function navCommand(id, title, subtitle, path, keywords = [], kind = '') {
    return command(id, title, subtitle, () => navigateTo(path), keywords, kind);
  }

  function routeList(type) {
    return ROUTES[type]?.list || '/';
  }

  function routeDetail(type, id) {
    const route = ROUTES[type];
    if (!route) return '/';
    return route.detail ? route.detail(id) : route.list;
  }

  function detectContext() {
    const url = window.location.href.toLowerCase();
    const context = {
      platform: 'unknown',
      page: 'unknown',
      fields: [],
      vars: {},
      url: window.location.href
    };

    if (url.includes('halopsa')) context.platform = 'halopsa';
    else if (url.includes('haloitsm')) context.platform = 'haloitsm';
    else if (url.includes('haloservicedesk')) context.platform = 'haloitsm';

    if (url.includes('/report')) context.page = 'report';
    else if (url.includes('/lookup') || url.includes('lookup')) context.page = 'lookup';
    else if (url.includes('/ticket') || url.includes('/fault')) context.page = 'ticket';
    else if (url.includes('/config')) context.page = 'configuration';
    else if (url.includes('/asset') || url.includes('/device')) context.page = 'asset';
    else if (url.includes('/customer') || url.includes('/area')) context.page = 'organisation';
    else if (url.includes('/agent') || url.includes('/uname')) context.page = 'agent';

    try {
      const params = new URL(window.location.href).searchParams;
      const id = params.get('id');
      if (id && /^\d+$/.test(id)) {
        if (context.page === 'ticket')    context.vars['$ticketid']  = id;
        if (url.includes('/invoices'))    context.vars['$invoiceid'] = id;
        if (url.includes('/assets'))      context.vars['$assetid']   = id;
      }
      const clientId = params.get('clientid');
      if (clientId && /^\d+$/.test(clientId)) context.vars['$clientid'] = clientId;
      const siteId   = params.get('siteid');
      if (siteId   && /^\d+$/.test(siteId))   context.vars['$siteid']   = siteId;
      const agentId  = params.get('agentid');
      if (agentId  && /^\d+$/.test(agentId))  context.vars['$agentid']  = agentId;
      const userId   = params.get('userid');
      if (userId   && /^\d+$/.test(userId))   context.vars['$userid']   = userId;

      // Try to resolve $agentid from the logged-in agent profile in the DOM
      if (!context.vars['$agentid']) {
        const profileBtn = document.querySelector('[id*="agentid"], [data-agentid], [data-userid]');
        const agentNum = profileBtn?.dataset?.agentid || profileBtn?.dataset?.userid;
        if (agentNum && /^\d+$/.test(agentNum)) context.vars['$agentid'] = agentNum;
      }
    } catch (e) {
      // URL parsing is best effort.
    }

    try {
      const labels = document.querySelectorAll('label, .field-label, [class*="label"]');
      labels.forEach(label => {
        const text = label.textContent?.trim();
        if (text && text.length < 60) context.fields.push(text);
      });
      context.fields = [...new Set(context.fields)].slice(0, 30);
    } catch (e) {
      // Field detection is best effort.
    }

    return context;
  }

  function getAccessToken() {
    const keys = ['access_token', 'halo_access_token', 'token'];
    const stores = [window.localStorage, window.sessionStorage];

    for (const store of stores) {
      try {
        for (const key of keys) {
          const value = store.getItem(key);
          const token = readTokenValue(value);
          if (token) return token;
        }
      } catch (e) {
        // Storage access can be blocked in some contexts.
      }
    }

    const cookieMatch = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
    return cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
  }

  function readTokenValue(value) {
    if (!value) return '';
    if (/^[A-Za-z0-9._-]{20,}$/.test(value)) return value;

    try {
      const parsed = JSON.parse(value);
      return parsed?.access_token || parsed?.accessToken || parsed?.token || '';
    } catch (e) {
      return '';
    }
  }

  function createReportPayload(sql, name) {
    return [{
      name: name || 'HaloPlus Query',
      sql,
      mainentity: guessMainEntity(sql),
      _loadreportonly: true
    }];
  }

  function guessMainEntity(sql) {
    const match = String(sql || '').match(/\bfrom\s+([a-zA-Z0-9_]+)/i);
    if (!match) return '';

    const knownEntities = {
      faults: 'Faults',
      actions: 'Actions',
      users: 'Users',
      site: 'Site',
      area: 'Area',
      uname: 'Uname',
      device: 'Device',
      requesttype: 'RequestType',
      tstatus: 'TStatus',
      slahead: 'SLAHead',
      policy: 'Policy',
      servsite: 'ServSite',
      kbentry: 'KBEntry'
    };

    return knownEntities[match[1].toLowerCase()] || match[1];
  }

  async function runHaloReport(sql, name) {
    const token = getAccessToken();
    const headers = {
      accept: '*/*',
      'content-type': 'application/json',
      'halo-app-name': 'halo-agent-app',
      'x-halo-service': 'ReportService'
    };

    if (token) headers.authorization = `Bearer ${token}`;

    const response = await fetch(`${window.location.origin}/api/Report`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(createReportPayload(sql, name))
    });

    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      // Keep text for diagnostics.
    }

    if (!response.ok) {
      const detail = typeof data === 'string' ? data : (data?.message || data?.error || response.statusText);
      throw new Error(`Halo API ${response.status}: ${detail}`);
    }

    return data;
  }

  async function postHaloJson(path, body) {
    return haloApiRequest(path, { method: 'POST', body });
  }

  async function haloApiRequest(path, options = {}) {
    const token = getAccessToken();
    const method = String(options.method || 'GET').toUpperCase();
    const headers = {
      accept: '*/*',
      'content-type': 'application/json',
      'halo-app-name': 'halo-agent-app'
    };

    if (token) headers.authorization = `Bearer ${token}`;

    const requestInit = {
      method,
      credentials: 'include',
      headers
    };

    if (options.body !== undefined && options.body !== null && method !== 'GET') {
      requestInit.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const response = await fetch(`${window.location.origin}${path}`, requestInit);

    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      // Keep text for fallback redirect detection.
    }

    if (!response.ok) {
      const detail = typeof data === 'string' ? data : (data?.message || data?.error || response.statusText);
      throw new Error(`Halo API ${response.status}: ${detail}`);
    }

    return data;
  }

  function getCurrentTicketId() {
    const url = new URL(window.location.href);
    const direct = url.searchParams.get('id') || url.searchParams.get('faultid');
    if (direct && /^\d+$/.test(direct)) {
      const path = url.pathname.toLowerCase();
      const isTicketPage = /\/(tickets?|faults?)(\/|$)/.test(path) && !/\/config\//.test(path);
      if (isTicketPage) return Number(direct);
    }

    const fallback = detectContext().vars['$ticketid'];
    return fallback && /^\d+$/.test(fallback) ? Number(fallback) : 0;
  }

  function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function formatMinutes(value) {
    const minutes = Math.round(Number(value));
    if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
    }
    return `${minutes}m`;
  }

  function formatSlaState(value) {
    const map = {
      I: 'Inside SLA',
      O: 'Outside SLA',
      E: 'Excluded',
      A: 'Awaiting'
    };
    return map[String(value || '').toUpperCase()] || (value ? String(value) : 'Awaiting');
  }

  function buildTicket360Query(ticketId) {
    return `
SELECT TOP 1
  F.Faultid AS [Ticket ID],
  F.Symptom AS [Summary],
  TS.TStatusDesc AS [Status],
  P.PDesc AS [Priority],
  RT.RTDesc AS [Ticket Type],
  SL.SLDesc AS [SLA],
  F.SLAState AS [SLA State],
  F.DateOccured AS [Opened],
  F.FixByDate AS [Due By],
  F.DateCleared AS [Closed],
  U.uid AS [User ID],
  U.UUsername AS [End User],
  U.UEmail AS [User Email],
  U.UMobile AS [User Mobile],
  A.AArea AS [Client ID],
  A.AAreaDesc AS [Client],
  S.SSitenum AS [Site ID],
  S.SDesc AS [Site],
  AU.UNum AS [Assigned Agent ID],
  AU.UName AS [Assigned Agent],
  AU.USMTP AS [Assigned Agent Email],
  CU.UNum AS [Closed By ID],
  CU.UName AS [Closed By],
  D.DDevNum AS [Asset ID],
  D.DInvNo AS [Asset Tag]
FROM
  Faults F
  LEFT JOIN Users U ON F.UserID = U.uid
  LEFT JOIN TStatus TS ON F.Status = TS.TStatus
  LEFT JOIN Policy P ON F.Seriousness = P.PPolicy
  LEFT JOIN RequestType RT ON F.RequestTypeNew = RT.RTID
  LEFT JOIN SLAHead SL ON F.SLAID = SL.SLID
  LEFT JOIN Area A ON F.Areaint = A.AArea
  LEFT JOIN Site S ON F.SiteNumber = S.SSitenum
  LEFT JOIN Uname AU ON F.AssignedToInt = AU.UNum
  LEFT JOIN Uname CU ON F.ClearWhoInt = CU.UNum
  LEFT JOIN Device D ON F.DeviceNumber = D.DDevNum AND F.DevSite = D.DSite
WHERE
  F.Faultid = ${Number(ticketId)}
`.trim();
  }

  function buildTicketActionTimelineQuery(ticketId) {
    return `
SELECT TOP 25
  ActionNumber AS [Action ID],
  Who AS [Who],
  Whe_ AS [When],
  ActOutcome AS [Outcome],
  LEFT(CONVERT(nvarchar(max), Note), 400) AS [Note],
  TimeTaken AS [Time Taken],
  DateEmailed AS [Date Emailed],
  ActionHide AS [Hidden]
FROM
  Actions
WHERE
  Faultid = ${Number(ticketId)}
ORDER BY
  Whe_ DESC,
  ActionNumber DESC
`.trim();
  }

  function buildTicketCommercialTraceQuery(ticketId) {
    return `
SELECT
  Trace.RecordType AS [Record Type],
  Trace.RecordID AS [Record ID],
  Trace.Title AS [Title],
  Trace.RecordDate AS [Date],
  Trace.RefCode AS [Reference]
FROM (
  SELECT
    'Quote' AS RecordType,
    CAST(QH.qhid AS nvarchar(50)) AS RecordID,
    QH.QHtitle AS Title,
    QH.QHDate AS RecordDate,
    QH.QHPORef AS RefCode
  FROM QUOTATIONHEADER QH
  WHERE QH.QHfaultID = ${Number(ticketId)}

  UNION ALL

  SELECT
    'Sales Order' AS RecordType,
    CAST(OH.OHid AS nvarchar(50)) AS RecordID,
    OH.OHtitle AS Title,
    OH.OHorderdate AS RecordDate,
    OH.OHponumber AS RefCode
  FROM ORDERHEAD OH
  WHERE OH.OHfaultid = ${Number(ticketId)} OR OH.OHprojectfaultid = ${Number(ticketId)}

  UNION ALL

  SELECT
    'Purchase Order' AS RecordType,
    CAST(SOH.SHid AS nvarchar(50)) AS RecordID,
    SOH.SHtitle AS Title,
    SOH.SHPODate AS RecordDate,
    SOH.SHPORef AS RefCode
  FROM SUPPLIERORDERHEADER SOH
  WHERE SOH.SHfaultID = ${Number(ticketId)}

  UNION ALL

  SELECT
    'Invoice' AS RecordType,
    CAST(IH.ihid AS nvarchar(50)) AS RecordID,
    IH.IHname AS Title,
    IH.ihdatepaid AS RecordDate,
    IH.IH3rdPartyInvoiceNumber AS RefCode
  FROM InvoiceHeader IH
  INNER JOIN InvoiceDetail ID ON ID.IdIHid = IH.ihid
  WHERE ID.IDFaultid = ${Number(ticketId)}
) Trace
`.trim();
  }

  function getReportLoadError(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (typeof payload.report?.load_error === 'string' && payload.report.load_error) return payload.report.load_error;
    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (item && typeof item === 'object') {
          const nested = getReportLoadError(item);
          if (nested) return nested;
        }
      }
    }
    for (const value of Object.values(payload)) {
      if (value && typeof value === 'object') {
        const nested = getReportLoadError(value);
        if (nested) return nested;
      }
    }
    return '';
  }

  function sortTraceRows(rows) {
    return [...rows].sort((a, b) => {
      const dateA = new Date(a?.['Date'] || 0).getTime() || 0;
      const dateB = new Date(b?.['Date'] || 0).getTime() || 0;
      if (dateA !== dateB) return dateB - dateA;
      return String(a?.['Record Type'] || '').localeCompare(String(b?.['Record Type'] || ''));
    });
  }

  function extractRows(payload) {
    if (!payload) return [];
    if (Array.isArray(payload) && looksLikeRows(payload, '')) return payload;

    if (Array.isArray(payload) && payload.length && typeof payload[0] === 'object') {
      const directKeys = ['rows', 'data', 'result', 'results', 'reportdata', 'report_data'];
      for (const key of directKeys) {
        if (Array.isArray(payload[0][key]) && looksLikeRows(payload[0][key], key)) return payload[0][key];
      }
    }

    const directKeys = ['rows', 'data', 'result', 'results', 'reportdata', 'report_data'];
    for (const key of directKeys) {
      if (Array.isArray(payload[key]) && looksLikeRows(payload[key], key)) return payload[key];
    }

    let best = { rows: [], score: 0 };
    const visit = (value, path = '') => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        const score = scoreRows(value, path);
        if (score > best.score) best = { rows: value, score };
        value.slice(0, 20).forEach((item, index) => visit(item, `${path}[${index}]`));
        return;
      }
      Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    };
    visit(payload);
    return best.rows;
  }

  function looksLikeRows(value, path = '') {
    if (!Array.isArray(value) || !value.length || typeof value[0] !== 'object') return false;
    if (/(permission|filterable|available_columns|conditions|joins|series|chart|report\.permissions)/i.test(path)) return false;
    const keys = Object.keys(value[0]).map(key => key.toLowerCase());
    if (keys.includes('agent_id') && keys.includes('readonly')) return false;
    if (keys.includes('sys_name') && keys.includes('query')) return false;
    if (keys.includes('name') && keys.includes('data_type') && keys.includes('data_type_group')) return false;
    if (keys.includes('id') && keys.includes('name') && keys.includes('data_type') && keys.includes('data_type_group')) return false;
    return keys.length > 0;
  }

  function scoreRows(value, path) {
    if (!looksLikeRows(value, path)) return 0;
    const keys = Object.keys(value[0]);
    const usefulKeys = keys.filter(key => !/^(id|guid|name|type)$/i.test(key)).length;
    const preferred = ['ticket id', 'summary', 'status', 'priority', 'end user', 'record type', 'action id', 'when', 'outcome'];
    const preferredMatches = keys.filter(key => preferred.includes(String(key).toLowerCase())).length;
    return value.length + (usefulKeys * 4) + (preferredMatches * 25);
  }

  function injectStyles() {
    if (document.getElementById('haloutils-styles')) return;

    const style = document.createElement('style');
    style.id = 'haloutils-styles';
    style.textContent = `
      .hu-hidden { display: none !important; }
      .hu-palette-backdrop {
        position: fixed; inset: 0; z-index: 2147483600;
        background: rgba(12, 18, 28, 0.26);
      }
      .hu-palette {
        --hu-palette-font-scale: 1;
        position: fixed; top: 72px;
        z-index: 2147483601; background: #fff; color: #172033;
        border: 1px solid #d8dde8; border-radius: 8px; box-shadow: 0 24px 80px rgba(8, 16, 30, 0.28);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; overflow: visible;
        font-size: calc(15px * var(--hu-palette-font-scale));
      }
      .hu-palette-pos-mid {
        left: 50%; transform: translateX(-50%);
        width: min(760px, calc(100vw - 28px));
        max-height: min(720px, calc(100vh - 112px));
      }
      .hu-palette-pos-left {
        left: 18px;
        width: min(520px, calc(100vw - 36px));
        max-height: min(720px, calc(100vh - 112px));
      }
      .hu-palette-pos-right {
        right: 18px;
        width: min(520px, calc(100vw - 36px));
        max-height: min(720px, calc(100vh - 112px));
      }
      .hu-palette-tools {
        position: absolute; top: 9px; right: 9px;
        display: flex; gap: 4px; z-index: 2;
        opacity: 0; pointer-events: none; transition: opacity 0.15s ease-out;
      }
      .hu-palette:hover .hu-palette-tools,
      .hu-palette-tools:focus-within { opacity: 1; pointer-events: auto; }
      .hu-palette-input { padding-right: 200px; }
      .hu-palette-tool {
        height: 26px; min-width: 28px; padding: 0 7px;
        border: 1px solid rgba(216, 221, 232, 0.85); background: rgba(255,255,255,0.95);
        border-radius: 5px; color: #475066; font-size: 12px; font-weight: 600;
        cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 3px rgba(8,16,30,0.06);
      }
      .hu-palette-tool:hover { background: #eef4ff; color: #172033; border-color: #b8d7ff; }
      .hu-palette-tool-pos { position: relative; padding: 0 7px; }
      .hu-palette-pos-menu {
        position: absolute; top: 100%; right: 0; margin-top: 4px;
        display: none; flex-direction: column; min-width: 130px;
        background: #fff; border: 1px solid #d8dde8; border-radius: 6px;
        box-shadow: 0 8px 22px rgba(8,16,30,0.14); padding: 4px; gap: 2px; z-index: 1;
      }
      .hu-palette-tool-pos:hover .hu-palette-pos-menu,
      .hu-palette-tool-pos:focus-within .hu-palette-pos-menu { display: flex; }
      .hu-palette-pos-option {
        text-align: left; height: 26px; padding: 0 8px; font-size: 12px; font-weight: 500;
        border: 0; background: transparent; border-radius: 4px; cursor: pointer; color: #172033;
        display: flex; align-items: center; gap: 8px;
      }
      .hu-palette-pos-option:hover { background: #eef4ff; }
      .hu-palette-input {
        width: 100%; height: 44px; border: 0; border-bottom: 1px solid #e3e7ef;
        padding: 0 14px; font-size: calc(15px * var(--hu-palette-font-scale)); outline: none; color: #101827; background: #fff;
      }
      .hu-palette-list { max-height: 480px; overflow-y: auto; padding: 5px; }
      .hu-result {
        display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%;
        border: 0; background: transparent; text-align: left; padding: 6px 8px;
        min-height: 34px; border-radius: 5px; cursor: pointer; color: #172033; font: inherit;
      }
      .hu-result > span:first-child { min-width: 0; }
      .hu-result.hu-active, .hu-result:hover { background: #eef4ff; }
      .hu-palette .hu-result-title { display: block; font-size: calc(12.5px * var(--hu-palette-font-scale)); line-height: 1.25; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hu-palette .hu-result-sub { display: block; margin-top: 1px; color: #667085; font-size: calc(10.5px * var(--hu-palette-font-scale)); line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hu-palette .hu-result-kind { color: #6a7280; font-size: calc(10px * var(--hu-palette-font-scale)); line-height: 1; align-self: center; border: 1px solid #e0e5ee; border-radius: 5px; padding: 2px 5px; }
      .hu-palette-footer {
        border-top: 1px solid #e3e7ef; padding: 9px 14px 10px; background: #fbfcff;
        color: #667085; font-size: calc(12px * var(--hu-palette-font-scale));
      }
      .hu-palette-footer .hu-result-title { color: #172033; font-size: calc(12px * var(--hu-palette-font-scale)); }
      .hu-palette-footer .hu-result-sub { font-size: calc(11px * var(--hu-palette-font-scale)); white-space: normal; }
      .hu-drawer {
        position: fixed; right: 18px; top: 72px; bottom: 24px; width: min(520px, calc(100vw - 36px));
        z-index: 2147483599; background: #fff; color: #172033; border: 1px solid #d8dde8; border-radius: 8px;
        box-shadow: 0 18px 64px rgba(8, 16, 30, 0.24); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        display: flex; flex-direction: column; overflow: hidden;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .hu-drawer-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #e3e7ef; }
      .hu-drawer-title { font-size: 14px; font-weight: 800; }
      .hu-icon-btn { border: 1px solid #d8dde8; background: #fff; border-radius: 6px; min-width: 30px; height: 30px; cursor: pointer; color: #172033; }
      .hu-drawer-body { overflow: auto; padding: 10px; }
      .hu-row { width: 100%; border: 0; border-bottom: 1px solid #edf0f5; background: transparent; text-align: left; padding: 10px; cursor: pointer; color: #172033; font: inherit; }
      .hu-row:hover { background: #eef4ff; }
      .hu-row-title { display: block; font-size: 13px; font-weight: 700; }
      .hu-row-sub { display: block; color: #667085; font-size: 11px; margin-top: 2px; }
      .hu-field-tag {
        display: inline-flex; margin-left: 6px; padding: 1px 5px; border-radius: 5px;
        background: #eef4ff; color: #2259bc; border: 1px solid #cbd9f6;
        font-family: "SF Mono", "Cascadia Code", Consolas, monospace; font-size: 10px; vertical-align: baseline;
      }
      .hu-table-column-tag {
        display: inline-flex; width: max-content; max-width: 48%;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        margin: 0 0 0 5px; padding: 1px 4px; font-size: 9px; line-height: 1.25;
        opacity: 0.92; pointer-events: none;
        vertical-align: middle;
      }
      .hu-table-column-label-target { display: inline-flex; align-items: center; max-width: 100%; min-width: 0; }
      .hu-json-formatted { font-family: "SF Mono", "Cascadia Code", Consolas, monospace; font-size: 11px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; color: #172033; padding: 10px; margin: 0; }
      .hu-copy { border: 1px solid #d8dde8; background: #fff; border-radius: 5px; cursor: pointer; font-size: 10px; padding: 2px 6px; color: #172033; }
      .hu-copy-json { font-size: 11px; padding: 4px 10px; white-space: nowrap; flex-shrink: 0; }
      .hu-toolbar-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 10px; border-bottom: 1px solid #edf0f5; }
      .hu-section-row { background: #f3f6fc; cursor: default; border-bottom: 1px solid #e3e7ef; }
      .hu-section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #667085; font-weight: 600; }
      .hu-method-badge { font-size: 10px; padding: 2px 7px; white-space: nowrap; flex-shrink: 0; align-self: flex-start; margin-top: 2px; }
      .hu-api-row { cursor: default; }
      .hu-api-row:hover { background: #f8fafc; }
      .hu-api-row-inner { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; width: 100%; }
      .hu-card {
        background: #fff;
        border: 1px solid #e3e7ef;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 10px;
        box-shadow: 0 3px 10px rgba(8, 16, 30, 0.04);
      }
      .hu-ticket-hero {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        background: linear-gradient(135deg, #25343f 0%, #314754 100%);
        border-color: rgba(255, 155, 81, 0.25);
        color: #fff;
      }
      .hu-ticket-hero-main { min-width: 0; }
      .hu-ticket-id {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: rgba(255,255,255,0.68);
        margin-bottom: 4px;
      }
      .hu-ticket-summary {
        font-size: 15px;
        font-weight: 800;
        line-height: 1.35;
      }
      .hu-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }
      .hu-chip {
        display: inline-flex;
        align-items: center;
        padding: 3px 9px;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.14);
        font-size: 11px;
        font-weight: 600;
      }
      .hu-section-title,
      .hu-section-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 12px;
        font-weight: 800;
        color: #172033;
        margin-bottom: 10px;
      }
      .hu-stat-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .hu-stat {
        border: 1px solid #edf0f5;
        border-radius: 7px;
        padding: 10px;
        background: #fbfcfe;
      }
      .hu-stat-link { cursor: pointer; }
      .hu-stat-link:hover { border-color: #b8d7ff; background: #f5f9ff; }
      .hu-stat-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.45px;
        color: #667085;
        margin-bottom: 4px;
      }
      .hu-stat-value { font-size: 13px; font-weight: 700; color: #172033; }
      .hu-stat-sub { font-size: 11px; color: #667085; margin-top: 3px; }
      .hu-list { display: flex; flex-direction: column; gap: 8px; }
      .hu-list-row {
        border: 1px solid #edf0f5;
        border-radius: 7px;
        padding: 10px;
        background: #fff;
      }
      .hu-list-row-link { cursor: pointer; }
      .hu-list-row-link:hover { border-color: #b8d7ff; background: #f8fbff; }
      .hu-list-row-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      .hu-list-title { font-size: 13px; font-weight: 700; color: #172033; }
      .hu-list-meta { font-size: 11px; color: #667085; white-space: nowrap; }
      .hu-list-row-sub { font-size: 11px; color: #667085; margin-top: 4px; }
      .hu-list-note {
        font-size: 12px;
        color: #172033;
        margin-top: 8px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .hu-empty-note {
        font-size: 12px;
        color: #667085;
        padding: 4px 2px 0;
      }
      .hu-360-kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
      .hu-360-kpi { border: 1px solid #edf0f5; border-radius: 8px; padding: 10px 12px; background: #fbfcfe; }
      .hu-360-kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #667085; margin-bottom: 4px; }
      .hu-360-kpi-value { font-size: 13px; font-weight: 800; color: #172033; display: flex; align-items: center; gap: 6px; }
      .hu-360-kpi-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .hu-360-time-labels { display: flex; justify-content: space-between; font-size: 10px; color: #667085; margin-bottom: 4px; }
      .hu-360-time-track { height: 6px; background: #edf0f5; border-radius: 99px; overflow: hidden; }
      .hu-360-time-fill { height: 100%; border-radius: 99px; }
      .hu-360-time-note { font-size: 10px; color: #667085; margin-top: 4px; text-align: right; }
      .hu-360-act-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
      .hu-360-act-label { font-size: 11px; color: #667085; width: 90px; flex-shrink: 0; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hu-360-act-track { flex: 1; height: 5px; background: #edf0f5; border-radius: 99px; overflow: hidden; }
      .hu-360-act-fill { height: 100%; border-radius: 99px; }
      .hu-360-act-count { font-size: 11px; color: #667085; width: 20px; text-align: right; flex-shrink: 0; }
      .hu-360-tl { display: flex; flex-direction: column; }
      .hu-360-tl-row { display: grid; grid-template-columns: 20px 1fr; gap: 8px; }
      .hu-360-tl-gutter { display: flex; flex-direction: column; align-items: center; padding-top: 3px; }
      .hu-360-tl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .hu-360-tl-line { width: 1px; flex: 1; background: #e3e7ef; margin-top: 4px; min-height: 16px; }
      .hu-360-tl-body { padding-bottom: 14px; min-width: 0; }
      .hu-360-tl-title { font-size: 12px; font-weight: 700; color: #172033; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hu-360-tl-meta { font-size: 11px; color: #667085; margin-top: 2px; }
      .hu-360-tl-note { font-size: 11px; color: #5e7290; background: #f8fafc; border: 1px solid #edf0f5; border-radius: 5px; padding: 6px 8px; margin-top: 6px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: break-word; }
      button#hu-360-inject-btn { background: #fe9200 !important; border-color: #fe9200 !important; color: #fff !important; transition: background 0.15s, border-color 0.15s !important; }
      button#hu-360-inject-btn:hover { background: #e68400 !important; border-color: #e68400 !important; }
      button#hu-360-inject-btn.is-active { background: #bf6e00 !important; border-color: #bf6e00 !important; box-shadow: 0 0 0 3px rgba(254,146,0,0.25) !important; }
      @media (prefers-color-scheme: dark) {
        .hu-360-kpi { background: #151d2c; border-color: #2b3548; }
        .hu-360-kpi-value { color: #edf1f7; }
        .hu-360-time-track, .hu-360-act-track { background: #2b3548; }
        .hu-360-tl-line { background: #2b3548; }
        .hu-360-tl-title { color: #edf1f7; }
        .hu-360-tl-note { background: #151d2c; border-color: #2b3548; color: #a7afbd; }
      }
      @media (prefers-color-scheme: dark) {
        .hu-palette, .hu-drawer { background: #171b22; color: #edf1f7; border-color: #303744; }
        .hu-palette-input { background: #171b22; color: #edf1f7; border-color: #303744; }
        .hu-palette-footer { background: #151922; border-color: #303744; color: #a7afbd; }
        .hu-palette-footer .hu-result-title { color: #edf1f7; }
        .hu-result, .hu-row, .hu-icon-btn, .hu-copy { color: #edf1f7; background: transparent; border-color: #303744; }
        .hu-result.hu-active, .hu-result:hover, .hu-row:hover { background: #1d2a42; }
        .hu-result-sub, .hu-row-sub { color: #a7afbd; }
        .hu-drawer-header { border-color: #303744; }
        .hu-toolbar-row { border-color: #303744; }
        .hu-json-formatted { color: #edf1f7; }
        .hu-section-row { background: #1a2236; border-color: #303744; }
        .hu-section-label { color: #a7afbd; }
        .hu-api-row:hover { background: #1d2533; }
        .hu-card { background: #1a2236; border-color: #303744; box-shadow: none; }
        .hu-ticket-hero { background: linear-gradient(135deg, #25343f 0%, #314754 100%); border-color: rgba(255, 155, 81, 0.24); }
        .hu-section-title, .hu-section-title-row, .hu-stat-value, .hu-list-title, .hu-list-note { color: #edf1f7; }
        .hu-stat { background: #151d2c; border-color: #2b3548; }
        .hu-stat-link:hover, .hu-list-row-link:hover { background: #1d2533; border-color: #35507c; }
        .hu-stat-label, .hu-stat-sub, .hu-list-meta, .hu-list-row-sub, .hu-empty-note { color: #a7afbd; }
        .hu-list-row { background: #151d2c; border-color: #2b3548; }
      }
      .hu-tbl-export-bar { display: flex; justify-content: flex-end; margin-bottom: 4px; }
      .hu-tbl-export-bar.hu-tbl-export-inline {
        display: inline-flex; justify-content: flex-start; margin: 0 0 0 6px; vertical-align: middle;
      }
      .hu-tbl-export-wrap { position: relative; }
      .hu-tbl-export-dropdown {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      .hu-tbl-export-btn {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: auto;
        min-width: 30px;
        height: 30px;
        padding: 0 12px;
        font: inherit;
        cursor: pointer;
        background-color: rgb(255, 155, 81) !important;
        color: #fff !important;
        border: 0 !important;
        border-radius: 999px;
        white-space: nowrap;
        fill: #fff !important;
      }
      .hu-tbl-export-btn svg {
        width: 14px;
        height: 14px;
        flex: 0 0 auto;
        stroke: #fff !important;
        color: #fff !important;
      }
      .hu-tbl-export-menu {
        position: absolute; right: 0; top: calc(100% + 4px); z-index: 2147483598;
        background: #fff; border: 1px solid #d8dde8; border-radius: 6px;
        box-shadow: 0 6px 20px rgba(8,16,30,.14); min-width: 180px; padding: 4px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .hu-tbl-export-inline .hu-tbl-export-menu { left: 0; right: auto; }
      .hu-tbl-export-menu.hu-align-right { left: auto; right: 0; }
      .hu-tbl-export-menu.hu-align-left { left: 0; right: auto; }
      .hu-tbl-export-item {
        display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: 0;
        background: transparent; padding: 8px 10px;
        font-size: 12px; color: #172033; border-radius: 4px; cursor: pointer;
      }
      .hu-tbl-export-item svg {
        width: 14px;
        height: 14px;
        flex: 0 0 auto;
        fill: currentColor;
        stroke: none;
      }
      .hu-tbl-export-item:hover { background: #eef4ff; }
      @media (prefers-color-scheme: dark) {
        .hu-tbl-export-menu { background: #1a2236; border-color: #303744; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
        .hu-tbl-export-item { color: #d0d7e5; }
        .hu-tbl-export-item:hover { background: #1d2a42; }
      }

      /* Lookup SQL Builder */
        display: block; width: 100%; box-sizing: border-box;
        margin-bottom: 12px; padding: 10px 12px;
        background: #f8fafc; border: 1.5px solid #d0dae8; border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-size: 12px; color: #172033;
      }
        display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;
      }
        font-size: 10px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;
        color: #d96520; background: rgba(255,155,81,0.12); border: 1px solid rgba(255,155,81,0.3);
        border-radius: 4px; padding: 1px 6px;
      }
        padding: 4px 10px; border: 1px solid #c8d5e1; border-radius: 5px;
        background: #fff; color: #3d5068; font-size: 11px; font-weight: 600;
        cursor: pointer; font-family: inherit; transition: all 0.12s;
      }
        padding: 4px 7px; border: 1px solid #c8d5e1; border-radius: 5px;
        background: #fff; color: #172033; font-size: 11px; font-family: inherit; outline: none;
      }
        background: none; border: none; color: #d0390a; font-size: 15px; cursor: pointer;
        padding: 0 4px; opacity: 0.55; line-height: 1; flex-shrink: 0;
      }
        padding: 2px 8px; border: 1px solid rgba(14,148,136,0.3); border-radius: 99px;
        background: rgba(255,155,81,0.08); color: #d96520; font-size: 10.5px; font-weight: 600;
        cursor: pointer; font-family: monospace;
      }
        margin: 0; padding: 8px 10px; font-family: 'Consolas', 'Courier New', monospace;
        font-size: 11px; line-height: 1.6; background: #0f1c2e; color: #a8d8d2;
        border-radius: 5px; border: 1px solid rgba(255,155,81,0.15); white-space: pre-wrap; word-break: break-word;
      }
      @media (prefers-color-scheme: dark) {
      }
    `;
    document.documentElement.appendChild(style);
    applyThemeStyles();
  }

  function applyTheme(theme) {
    HU.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('hu-theme-dark', HU.theme === 'dark');
    document.documentElement.classList.toggle('hu-theme-light', HU.theme !== 'dark');
    applyThemeStyles();
  }

  function applyThemeStyles() {
    let style = document.getElementById('haloplus-theme-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'haloplus-theme-styles';
      document.documentElement.appendChild(style);
    }

    if (HU.theme !== 'dark') {
      style.textContent = `
      html.hu-theme-light .hu-palette,
      html.hu-theme-light .hu-drawer { background: #fff; color: #172033; border-color: #d8dde8; }
      html.hu-theme-light .hu-palette-input { background: #fff; color: #101827; border-color: #e3e7ef; }
      html.hu-theme-light .hu-palette-footer { background: #fbfcff; border-color: #e3e7ef; color: #667085; }
      html.hu-theme-light .hu-palette-footer .hu-result-title { color: #172033; }
      html.hu-theme-light .hu-result,
      html.hu-theme-light .hu-row,
      html.hu-theme-light .hu-icon-btn,
      html.hu-theme-light .hu-copy { color: #172033; background: transparent; border-color: #d8dde8; }
      html.hu-theme-light .hu-result.hu-active,
      html.hu-theme-light .hu-result:hover,
      html.hu-theme-light .hu-row:hover { background: #eef4ff; }
      html.hu-theme-light .hu-result-sub,
      html.hu-theme-light .hu-row-sub { color: #667085; }
      html.hu-theme-light .hu-drawer-header,
      html.hu-theme-light .hu-toolbar-row { border-color: #edf0f5; }
      html.hu-theme-light .hu-json-formatted { color: #172033; }
      html.hu-theme-light .hu-section-row { background: #f3f6fc; border-color: #e3e7ef; }
      html.hu-theme-light .hu-section-label { color: #667085; }
      html.hu-theme-light .hu-api-row:hover { background: #f8fafc; }
      html.hu-theme-light .hu-card { background: #fff; border-color: #e3e7ef; box-shadow: 0 3px 10px rgba(8, 16, 30, 0.04); }
      html.hu-theme-light .hu-ticket-hero { background: linear-gradient(135deg, #25343f 0%, #314754 100%); border-color: rgba(255, 155, 81, 0.25); }
      html.hu-theme-light .hu-section-title,
      html.hu-theme-light .hu-section-title-row,
      html.hu-theme-light .hu-stat-value,
      html.hu-theme-light .hu-list-title,
      html.hu-theme-light .hu-list-note,
      html.hu-theme-light .hu-360-kpi-value,
      html.hu-theme-light .hu-360-tl-title { color: #172033; }
      html.hu-theme-light .hu-stat,
      html.hu-theme-light .hu-360-kpi { background: #fbfcfe; border-color: #edf0f5; }
      html.hu-theme-light .hu-stat-link:hover { border-color: #b8d7ff; background: #f5f9ff; }
      html.hu-theme-light .hu-list-row-link:hover { border-color: #b8d7ff; background: #f8fbff; }
      html.hu-theme-light .hu-stat-label,
      html.hu-theme-light .hu-stat-sub,
      html.hu-theme-light .hu-list-meta,
      html.hu-theme-light .hu-list-row-sub,
      html.hu-theme-light .hu-empty-note,
      html.hu-theme-light .hu-360-time-labels,
      html.hu-theme-light .hu-360-time-note,
      html.hu-theme-light .hu-360-act-label,
      html.hu-theme-light .hu-360-act-count,
      html.hu-theme-light .hu-360-tl-meta { color: #667085; }
      html.hu-theme-light .hu-list-row { background: #fff; border-color: #edf0f5; }
      html.hu-theme-light .hu-360-time-track,
      html.hu-theme-light .hu-360-act-track { background: #edf0f5; }
      html.hu-theme-light .hu-360-tl-line { background: #e3e7ef; }
      html.hu-theme-light .hu-360-tl-note { background: #f8fafc; border-color: #edf0f5; color: #5e7290; }
      html.hu-theme-light .hu-tbl-export-menu { background: #fff; border-color: #d8dde8; box-shadow: 0 6px 20px rgba(8,16,30,.14); }
      html.hu-theme-light .hu-tbl-export-item { color: #172033; }
      html.hu-theme-light .hu-tbl-export-item:hover { background: #eef4ff; }
      `;
      return;
    }

    style.textContent = `
      html.hu-theme-dark .hu-palette,
      html.hu-theme-dark .hu-drawer { background: #171b22; color: #edf1f7; border-color: #303744; }
      html.hu-theme-dark .hu-palette-input { background: #171b22; color: #edf1f7; border-color: #303744; }
      html.hu-theme-dark .hu-palette-footer { background: #151922; border-color: #303744; color: #a7afbd; }
      html.hu-theme-dark .hu-palette-footer .hu-result-title { color: #edf1f7; }
      html.hu-theme-dark .hu-result,
      html.hu-theme-dark .hu-row,
      html.hu-theme-dark .hu-icon-btn,
      html.hu-theme-dark .hu-copy { color: #edf1f7; background: transparent; border-color: #303744; }
      html.hu-theme-dark .hu-result.hu-active,
      html.hu-theme-dark .hu-result:hover,
      html.hu-theme-dark .hu-row:hover { background: #1d2a42; }
      html.hu-theme-dark .hu-result-sub,
      html.hu-theme-dark .hu-row-sub { color: #a7afbd; }
      html.hu-theme-dark .hu-drawer-header,
      html.hu-theme-dark .hu-toolbar-row { border-color: #303744; }
      html.hu-theme-dark .hu-json-formatted { color: #edf1f7; }
      html.hu-theme-dark .hu-section-row { background: #1a2236; border-color: #303744; }
      html.hu-theme-dark .hu-section-label { color: #a7afbd; }
      html.hu-theme-dark .hu-api-row:hover { background: #1d2533; }
      html.hu-theme-dark .hu-card { background: #1a2236; border-color: #303744; box-shadow: none; }
      html.hu-theme-dark .hu-ticket-hero { background: linear-gradient(135deg, #25343f 0%, #314754 100%); border-color: rgba(255, 155, 81, 0.24); }
      html.hu-theme-dark .hu-section-title,
      html.hu-theme-dark .hu-section-title-row,
      html.hu-theme-dark .hu-stat-value,
      html.hu-theme-dark .hu-list-title,
      html.hu-theme-dark .hu-list-note,
      html.hu-theme-dark .hu-360-kpi-value,
      html.hu-theme-dark .hu-360-tl-title { color: #edf1f7; }
      html.hu-theme-dark .hu-stat,
      html.hu-theme-dark .hu-360-kpi { background: #151d2c; border-color: #2b3548; }
      html.hu-theme-dark .hu-stat-link:hover,
      html.hu-theme-dark .hu-list-row-link:hover { background: #1d2533; border-color: #35507c; }
      html.hu-theme-dark .hu-stat-label,
      html.hu-theme-dark .hu-stat-sub,
      html.hu-theme-dark .hu-list-meta,
      html.hu-theme-dark .hu-list-row-sub,
      html.hu-theme-dark .hu-empty-note,
      html.hu-theme-dark .hu-360-time-labels,
      html.hu-theme-dark .hu-360-time-note,
      html.hu-theme-dark .hu-360-act-label,
      html.hu-theme-dark .hu-360-act-count,
      html.hu-theme-dark .hu-360-tl-meta { color: #a7afbd; }
      html.hu-theme-dark .hu-list-row { background: #151d2c; border-color: #2b3548; }
      html.hu-theme-dark .hu-360-time-track,
      html.hu-theme-dark .hu-360-act-track { background: #2b3548; }
      html.hu-theme-dark .hu-360-tl-line { background: #2b3548; }
      html.hu-theme-dark .hu-360-tl-note { background: #151d2c; border-color: #2b3548; color: #a7afbd; }
      html.hu-theme-dark .hu-tbl-export-menu { background: #1a2236; border-color: #303744; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
      html.hu-theme-dark .hu-tbl-export-item { color: #d0d7e5; }
      html.hu-theme-dark .hu-tbl-export-item:hover { background: #1d2a42; }
      html.hu-theme-dark .hu-palette-tool { background: rgba(23,27,34,0.92); border-color: #303744; color: #c7cedb; }
      html.hu-theme-dark .hu-palette-tool:hover { background: #1d2a42; color: #edf1f7; border-color: #35507c; }
      html.hu-theme-dark .hu-palette-pos-menu { background: #171b22; border-color: #303744; box-shadow: 0 8px 22px rgba(0,0,0,0.35); }
      html.hu-theme-dark .hu-palette-pos-option { color: #edf1f7; }
      html.hu-theme-dark .hu-palette-pos-option:hover { background: #1d2a42; }
    `;
  }

  async function initTheme() {
    const data = await storageGet(['huTheme']);
    applyTheme(data?.huTheme === 'dark' ? 'dark' : 'light');
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.huTheme) return;
      applyTheme(changes.huTheme.newValue === 'dark' ? 'dark' : 'light');
    });
  }

  function loadSettings() {
    storageGet(['huSettings']).then(data => {
      Object.assign(HU.settings, data.huSettings || {});
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.huSettings) return;
      Object.assign(HU.settings, changes.huSettings.newValue || {});
    });
  }

  function loadPaletteSettings() {
    storageGet(['huPalette']).then(data => {
      Object.assign(HU.palette, data.huPalette || {});
      applyPaletteSettings();
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.huPalette) return;
      Object.assign(HU.palette, changes.huPalette.newValue || {});
      applyPaletteSettings();
    });
  }

  function applyPaletteSettings() {
    const palette = document.getElementById('hu-palette');
    if (!palette) return;
    palette.classList.remove('hu-palette-pos-left', 'hu-palette-pos-mid', 'hu-palette-pos-right');
    const placement = ['left', 'right', 'mid'].includes(HU.palette.placement) ? HU.palette.placement : 'mid';
    palette.classList.add(`hu-palette-pos-${placement}`);
    const scale = Number(HU.palette.fontScale) || 1;
    const clamped = Math.min(Math.max(scale, 0.8), 1.5);
    palette.style.setProperty('--hu-palette-font-scale', String(clamped));
  }

  function savePaletteSettings(patch) {
    Object.assign(HU.palette, patch);
    chrome.storage.local.set({ huPalette: { ...HU.palette } });
    applyPaletteSettings();
  }

  function paletteSettingsPlacementGlyph(placement) {
    if (placement === 'left') return '◧';
    if (placement === 'right') return '◨';
    return '▭';
  }

  function wirePaletteTools(palette) {
    const tools = palette.querySelector('.hu-palette-tools');
    if (!tools) return;

    tools.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) event.preventDefault();
    });

    tools.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      const placement = event.target.closest('[data-placement]')?.dataset.placement;

      if (placement) {
        savePaletteSettings({ placement });
        tools.querySelectorAll('.hu-palette-pos-current').forEach(el => {
          el.textContent = paletteSettingsPlacementGlyph(placement);
        });
        return;
      }

      if (action === 'font-up') {
        savePaletteSettings({ fontScale: Math.min((HU.palette.fontScale || 1) + 0.1, 1.5) });
        return;
      }
      if (action === 'font-down') {
        savePaletteSettings({ fontScale: Math.max((HU.palette.fontScale || 1) - 0.1, 0.8) });
        return;
      }
      if (action === 'theme') {
        const next = HU.theme === 'dark' ? 'light' : 'dark';
        chrome.storage.local.set({ huTheme: next });
        applyTheme(next);
        const themeBtn = tools.querySelector('[data-action="theme"]');
        if (themeBtn) themeBtn.textContent = next === 'dark' ? '☼' : '☾';
        return;
      }
      if (action === 'settings') {
        chrome.runtime.sendMessage({ type: 'HU_OPEN_SETTINGS' }, () => void chrome.runtime.lastError);
        closePalette();
        return;
      }
    });
  }

  function initPalette() {
    ['keyup', 'keypress', 'beforeinput'].forEach(type => {
      document.addEventListener(type, suppressHaloSlashShortcut, true);
    });

    document.addEventListener('keydown', (event) => {
      if (shouldSuppressSlashEvent(event)) {
        consumeEvent(event);
        return;
      }

      if (HU.paletteOpen) {
        handlePaletteKey(event);
        return;
      }

      if (event.key === '/' && !isTypingTarget(event.target)) {
        HU.suppressSlashUntil = Date.now() + 600;
        consumeEvent(event);
        openPalette('/');
      }
    }, true);
  }

  function suppressHaloSlashShortcut(event) {
    if (shouldSuppressSlashEvent(event)) consumeEvent(event);
  }

  function shouldSuppressSlashEvent(event) {
    if (Date.now() > HU.suppressSlashUntil) return false;
    if (event.type === 'beforeinput') return event.data === '/';
    return event.key === '/' || event.code === 'Slash';
  }

  function consumeEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function openPalette(seed = '') {
    injectStyles();
    closePalette();

    HU.paletteOpen = true;
    HU.paletteShowAll = false;
    HU.selectedIndex = 0;

    // Refresh custom commands from storage (re-renders palette if changed)
    loadCustomCommands().then(() => {
      if (HU.paletteOpen) {
        const input = document.getElementById('hu-palette-input');
        if (input) runPaletteSearch(input.value);
      }
    }).catch(() => {});

    const backdrop = document.createElement('div');
    backdrop.className = 'hu-palette-backdrop';
    backdrop.id = 'hu-palette-backdrop';
    backdrop.addEventListener('click', closePalette);

    const palette = document.createElement('div');
    palette.className = 'hu-palette';
    palette.id = 'hu-palette';
    palette.innerHTML = `
      <div class="hu-palette-tools" id="hu-palette-tools" aria-label="Palette settings">
        <button type="button" class="hu-palette-tool" data-action="font-down" title="Decrease font size">A-</button>
        <button type="button" class="hu-palette-tool" data-action="font-up" title="Increase font size">A+</button>
        <button type="button" class="hu-palette-tool" data-action="theme" title="Toggle light / dark">${HU.theme === 'dark' ? '☼' : '☾'}</button>
        <div class="hu-palette-tool hu-palette-tool-pos" data-action="placement" title="Palette placement">
          <span class="hu-palette-pos-current">${paletteSettingsPlacementGlyph(HU.palette.placement)}</span>
          <div class="hu-palette-pos-menu" role="menu">
            <button type="button" class="hu-palette-pos-option" data-placement="left" role="menuitem">${paletteSettingsPlacementGlyph('left')} Top left</button>
            <button type="button" class="hu-palette-pos-option" data-placement="mid" role="menuitem">${paletteSettingsPlacementGlyph('mid')} Center</button>
            <button type="button" class="hu-palette-pos-option" data-placement="right" role="menuitem">${paletteSettingsPlacementGlyph('right')} Top right</button>
          </div>
        </div>
        <button type="button" class="hu-palette-tool" data-action="settings" title="Open HaloPlus settings">⚙</button>
      </div>
      <input class="hu-palette-input" id="hu-palette-input" autocomplete="off" spellcheck="false" placeholder="/t 2937, /c acme, /a alex, /360, /r">
      <div class="hu-palette-list" id="hu-palette-list"></div>
      <div class="hu-palette-footer" id="hu-palette-footer"></div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(palette);
    applyPaletteSettings();
    wirePaletteTools(palette);

    const input = document.getElementById('hu-palette-input');
    input.value = seed;
    focusPaletteInput(input);
    input.addEventListener('input', () => {
      HU.paletteShowAll = false;
      updatePaletteFooter(input.value);
      schedulePaletteSearch(input.value);
    });
    runPaletteSearch(seed);
  }

  function focusPaletteInput(input) {
    const focus = () => {
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    };

    focus();
    requestAnimationFrame(focus);
    setTimeout(focus, 50);
  }

  function closePalette() {
    document.getElementById('hu-palette')?.remove();
    document.getElementById('hu-palette-backdrop')?.remove();
    HU.paletteOpen = false;
    clearTimeout(HU.searchTimer);
  }

  function handlePaletteKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      HU.selectedIndex = Math.min(HU.selectedIndex + 1, HU.paletteResults.length - 1);
      renderPaletteResults(HU.paletteResults);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      HU.selectedIndex = Math.max(HU.selectedIndex - 1, 0);
      renderPaletteResults(HU.paletteResults);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const result = HU.paletteResults[HU.selectedIndex];
      if (result) activateResult(result);
    }
  }

  function schedulePaletteSearch(query) {
    clearTimeout(HU.searchTimer);
    HU.searchTimer = setTimeout(() => runPaletteSearch(query), 180);
  }

  function getEntitySearchQuery(query) {
    const normalized = normalizeQuery(query);
    const spaceIdx = normalized.indexOf(' ');
    if (spaceIdx === -1) return null;
    const keyword = normalized.slice(0, spaceIdx);
    const searchTerm = normalized.slice(spaceIdx + 1).trim();
    const commandId = ENTITY_COMMAND_IDS[keyword];
    if (!commandId) return null;
    const def = ENTITY_SEARCH_MAP[keyword] || HU.ticketTypeSearchMap[keyword];
    if (!def || !searchTerm) return null;
    return { def: { ...def, commandId }, keyword, searchTerm };
  }

  async function searchEntityRecords(def, searchTerm) {
    if (def.commandId === 'rep') return searchReports(searchTerm);

    const primary = await runEntitySearchForDef(def, searchTerm);
    if (!def.combineWith?.length) return primary;

    const secondary = await Promise.allSettled(
      def.combineWith
        .map(keyword => ENTITY_SEARCH_MAP[keyword])
        .filter(Boolean)
        .map(secDef => runEntitySearchForDef(secDef, searchTerm))
    );
    const extra = secondary.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const seen = new Set();
    return [...primary, ...extra].filter(row => {
      const key = `${row.kind}|${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  }

  async function runEntitySearchForDef(def, searchTerm) {
    const escaped = sqlEscape(searchTerm);
    const numeric = /^\d+$/.test(searchTerm);
    const searchColumns = numeric ? [] : await resolveSearchColumns(def.table, def.searchCols, def.optionalSearchCols);
    const baseWhere = numeric
      ? `${def.id} = ${Number(searchTerm)} OR CONVERT(nvarchar(max), ${def.id}) LIKE '%${escaped}%'`
      : buildTextSearchWhere(searchColumns, escaped);
    if (!baseWhere) return [];

    const sectionClause = buildSectionClause(def);
    const where = sectionClause ? `(${baseWhere})${sectionClause}` : baseWhere;

    const base = {
      kind: def.kind, routeType: def.route, table: def.table,
      idColumn: def.id, titleColumn: def.title, subtitleColumn: def.sub,
      extraCols: def.extraCols, searchTerm, emailTag: def.emailTag,
      ticketPrefix: def.ticketPrefix,
      typeId: sectionClause ? undefined : def.typeId
    };

    try {
      const results = await runSearchQuery({ ...base, where });
      if (results.length || numeric || !def.optionalSearchCols?.length) return results;
      return await searchOptionalEntityColumns(def, searchTerm, escaped, searchColumns, base, sectionClause);
    } catch (e) {
      if (numeric || !def.optionalSearchCols?.length) return [];
      return await searchOptionalEntityColumns(def, searchTerm, escaped, searchColumns, base, sectionClause);
    }
  }

  function buildSectionClause(def) {
    if (!def.sectionMatch?.length) return '';
    const parts = def.sectionMatch
      .map(needle => `CONVERT(nvarchar(max), Sectio_) LIKE '%${sqlEscape(String(needle))}%'`)
      .join(' OR ');
    return ` AND (${parts})`;
  }

  function buildTextSearchWhere(columns, escapedSearchTerm) {
    return (columns || [])
      .map(col => `CONVERT(nvarchar(max), ${col}) LIKE '%${escapedSearchTerm}%'`)
      .join(' OR ');
  }

  async function searchOptionalEntityColumns(def, searchTerm, escapedSearchTerm, existingColumns, base, sectionClause = '') {
    const tried = new Set((existingColumns || []).map(column => column.toLowerCase()));
    for (const column of def.optionalSearchCols || []) {
      if (tried.has(column.toLowerCase())) continue;
      const baseWhere = buildTextSearchWhere([...(def.searchCols || []), column], escapedSearchTerm);
      if (!baseWhere) continue;
      const where = sectionClause ? `(${baseWhere})${sectionClause}` : baseWhere;
      try {
        const results = await runSearchQuery({ ...base, where });
        if (results.length) return results;
      } catch (e) {
        // Optional column not available on this instance.
      }
    }
    return [];
  }

  async function runPaletteSearch(rawQuery) {
    const query = rawQuery.trim();
    updatePaletteFooter(query);

    // Entity-scoped search: "/t 2937" or "/c Acme" searches within one record type.
    const entityQuery = getEntitySearchQuery(query);
    if (entityQuery) {
      const navCmd = BASE_COMMANDS.find(c => c.id === entityQuery.def.commandId)
        || HU.ticketTypeCommands.find(c => c.id === entityQuery.def.commandId);
      const navResults = navCmd ? [{ ...navCmd, displayTitle: `/${entityQuery.keyword}`, kind: navCmd.kind || 'ITSM' }] : [];
      HU.paletteResults = navResults;
      HU.selectedIndex = 0;
      renderPaletteResults(navResults, false);

      const liveResults = await searchEntityRecords(entityQuery.def, entityQuery.searchTerm);
      if (!HU.paletteOpen) return;
      HU.paletteResults = mergeEntitySearchResults(navResults, liveResults, entityQuery.searchTerm).slice(0, 20);
      renderPaletteResults(HU.paletteResults, false);
      return;
    }

    const results = buildLocalPaletteResults(query);
    HU.paletteResults = results;
    HU.selectedIndex = 0;
    renderPaletteResults(results, false);

    const impersonationQuery = getImpersonationQuery(query);
    if (impersonationQuery !== null) {
      if (impersonationQuery.length >= 1) {
        const liveResults = await searchAgentsForImpersonation(impersonationQuery);
        if (!HU.paletteOpen) return;
        HU.paletteResults = [...results, ...liveResults].slice(0, 30);
        renderPaletteResults(HU.paletteResults, false);
      }
      return;
    }

    if (query.length >= 2) {
      const liveResults = await searchHaloRecords(query);
      if (!HU.paletteOpen) return;
      HU.paletteResults = [...results, ...liveResults].slice(0, 40);
      renderPaletteResults(HU.paletteResults, false);
    }
  }

  async function resolveSearchColumns(table, requiredColumns, optionalColumns = []) {
    const required = [...new Set(requiredColumns || [])].filter(Boolean);
    const optional = [...new Set(optionalColumns || [])].filter(Boolean);
    if (!required.length && !optional.length) return [];
    if (!optional.length) return required;

    const available = await getTableColumnSet(table);
    if (!available?.size) return required;

    const existingColumns = [
      ...required,
      ...optional.filter(column => available.has(column.toLowerCase()))
    ].filter(column => available.has(column.toLowerCase()));
    return existingColumns.length ? existingColumns : required;
  }

  async function getTableColumnSet(table) {
    const cacheKey = table.toLowerCase();
    if (!HU.schemaColumnCache[cacheKey]) {
      HU.schemaColumnCache[cacheKey] = await loadTableColumns(table);
    }
    return HU.schemaColumnCache[cacheKey];
  }

  async function loadTableColumns(table) {
    try {
      const sql = `
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE LOWER(TABLE_NAME) = '${sqlEscape(table.toLowerCase())}'
`.trim();
      const payload = await runHaloReport(sql, `HaloPlus ${table} Column Discovery`);
      const columns = extractRows(payload)
        .map(row => getRowValue(row, 'COLUMN_NAME'))
        .filter(Boolean)
        .map(column => column.toLowerCase());
      return new Set(columns);
    } catch (e) {
      return new Set();
    }
  }

  async function searchReports(searchTerm) {
    const discovered = await discoverReportSearchCandidates();
    for (const candidate of discovered) {
      try {
        const rows = await runReportSearchCandidate(candidate, searchTerm);
        if (rows.length) return rows;
      } catch (e) {
        // Try the next discovered table shape.
      }
    }

    const candidates = [
      { table: 'report', id: 'rid', title: 'rname', subtitle: 'rdesc' },
      { table: 'report', id: 'ReportID', title: 'ReportName', subtitle: 'ReportDescription' },
      { table: 'report', id: 'ID', title: 'Name', subtitle: 'Description' },
      { table: 'reports', id: 'id', title: 'name', subtitle: 'description' },
      { table: 'reportlist', id: 'id', title: 'name', subtitle: 'description' },
      { table: 'reportlist', id: 'ReportID', title: 'ReportName', subtitle: 'ReportDescription' }
    ].filter((candidate, index, all) =>
      all.findIndex(item => `${item.table}.${item.id}.${item.title}.${item.subtitle}`.toLowerCase() ===
        `${candidate.table}.${candidate.id}.${candidate.title}.${candidate.subtitle}`.toLowerCase()) === index
    );

    for (const candidate of candidates) {
      try {
        const rows = await runReportSearchCandidate({
          ...candidate,
          searchColumns: [candidate.title, candidate.subtitle].filter(Boolean)
        }, searchTerm);
        if (rows.length) return rows;
      } catch (e) {
        // Try the next common report table shape.
      }
    }

    return [];
  }

  async function runReportSearchCandidate(candidate, searchTerm) {
    const escaped = sqlEscape(searchTerm);
    const numeric = /^\d+$/.test(searchTerm);
    const searchColumns = [...new Set(candidate.searchColumns || [candidate.title, candidate.subtitle].filter(Boolean))];
    const textWhere = searchColumns
      .map(column => `CONVERT(nvarchar(max), ${sqlIdent(column)}) LIKE '%${escaped}%'`)
      .join(' OR ');
    if (!numeric && !textWhere) return [];
    const where = numeric
        ? `${sqlIdent(candidate.id)} = ${Number(searchTerm)} OR CONVERT(nvarchar(max), ${sqlIdent(candidate.id)}) LIKE '%${escaped}%' OR CONVERT(nvarchar(max), ${sqlIdent(candidate.title)}) LIKE '%${escaped}%'`
        : textWhere;
    const sql = `
SELECT TOP 10
  ${sqlIdent(candidate.id)} AS [id],
  CONVERT(nvarchar(max), ${sqlIdent(candidate.title)}) AS [title],
  CONVERT(nvarchar(max), ${sqlIdent(candidate.subtitle || candidate.title)}) AS [subtitle]
FROM
  ${sqlIdent(candidate.table)}
WHERE
  ${where}
ORDER BY
  ${buildSqlSearchOrder(sqlIdent(candidate.id), sqlIdent(candidate.title), sqlIdent(candidate.subtitle || candidate.title), searchTerm)}
`.trim();
    const payload = await runHaloReport(sql, 'HaloPlus Report Search');
    return extractRows(payload).map(row => ({
      id: row.id,
      recordId: row.id,
      title: row.title || `Report ${row.id}`,
      subtitle: row.subtitle || `${candidate.table}.${candidate.id} = ${row.id}`,
      kind: 'Report',
      type: 'navigate',
      url: new URL(routeDetail('report', row.id), window.location.origin).href
    }));
  }

  async function discoverReportSearchCandidates() {
    try {
      const sql = `
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE LOWER(TABLE_NAME) LIKE '%report%'
ORDER BY TABLE_NAME, ORDINAL_POSITION
`.trim();
      const payload = await runHaloReport(sql, 'HaloPlus Report Search Discovery');
      const grouped = new Map();
      extractRows(payload).forEach(row => {
        const table = getRowValue(row, 'TABLE_NAME');
        const column = getRowValue(row, 'COLUMN_NAME');
        if (!table || !column) return;
        if (!grouped.has(table)) grouped.set(table, []);
        grouped.get(table).push(column);
      });

      return [...grouped.entries()]
        .map(([table, columns]) => {
          const id = pickColumn(columns, [/^reportid$/i, /^report_id$/i, /^rid$/i, /^rptid$/i, /^id$/i, /report.*id/i, /(^|_)id$/i, /id$/i]);
          const title = pickColumn(columns, [/^reportname$/i, /^report_name$/i, /^rname$/i, /^rptname$/i, /^name$/i, /title/i, /summary/i, /description/i, /desc/i]);
          const subtitle = pickColumn(columns, [/description/i, /desc/i, /group/i, /category/i, /folder/i, /name/i]);
          if (!id || !title) return null;
          const searchColumns = columns.filter(column => /(name|title|desc|description|summary|query|sql|group|category|folder)/i.test(column));
          return { table, id, title, subtitle: subtitle || title, searchColumns };
        })
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function pickColumn(columns, patterns) {
    return patterns.reduce((found, pattern) => found || columns.find(column => pattern.test(column)), '');
  }

  function getRowValue(row, wantedKey) {
    const key = Object.keys(row || {}).find(candidate => candidate.toLowerCase() === wantedKey.toLowerCase());
    return key ? String(row[key] ?? '') : '';
  }

  function sqlIdent(name) {
    return `[${String(name).replace(/]/g, ']]')}]`;
  }

  function mergeEntitySearchResults(navResults, liveResults, searchTerm) {
    const rankedLiveResults = rankScopedSearchResults(liveResults, searchTerm);
    if (rankedLiveResults.length) return [...rankedLiveResults, ...navResults];
    return navResults;
  }

  function rankScopedSearchResults(results, searchTerm) {
    const normalized = normalizeSearchValue(searchTerm);
    return [...results].sort((a, b) =>
      scopedSearchScore(b, normalized) - scopedSearchScore(a, normalized) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    );
  }

  function scopedSearchScore(item, normalizedSearchTerm) {
    if (!normalizedSearchTerm) return 0;

    const title = normalizeSearchValue(item.title);
    const subtitle = normalizeSearchValue(item.subtitle);
    const id = normalizeSearchValue(item.id || item.recordId);
    const haystack = `${title} ${subtitle}`.trim();
    const numericTerm = normalizeNumericValue(normalizedSearchTerm);
    const numericId = normalizeNumericValue(id);
    let score = 0;

    if (numericTerm && numericId === numericTerm) score += 1000;
    if (numericTerm && numericId.includes(numericTerm)) score += 800;
    if (id === normalizedSearchTerm || title === normalizedSearchTerm) score += 900;
    if (title.startsWith(normalizedSearchTerm)) score += 700;
    if (id.startsWith(normalizedSearchTerm)) score += 650;
    if (id.includes(normalizedSearchTerm)) score += 550;
    if (haystack.includes(normalizedSearchTerm)) score += 500;

    const words = normalizedSearchTerm.split(/\s+/).filter(Boolean);
    if (words.length) {
      const titleWords = title.split(/\s+/).filter(Boolean);
      const matchedWords = words.filter(word => haystack.includes(word)).length;
      score += matchedWords * 80;
      if (matchedWords === words.length) score += 200;
      if (words.every((word, index) => titleWords[index] === word)) score += 120;
    }

    return score;
  }

  function normalizeSearchValue(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeNumericValue(value) {
    const normalized = String(value || '').match(/\d+/)?.[0] || '';
    return normalized ? String(Number(normalized)) : '';
  }

  function getCommandAliasId(query) {
    return COMMAND_ALIASES[normalizeQuery(query)] || '';
  }

  function rankMatch(title, id, keywords, normalized) {
    if (!normalized) return 0;
    const t = String(title || '').toLowerCase();
    const i = String(id   || '').toLowerCase();
    if (i === normalized || t === normalized) return 3;
    if (i.startsWith(normalized) || t.startsWith(normalized)) return 2;
    if ((keywords || []).some(k => String(k).toLowerCase().startsWith(normalized))) return 1;
    return 0;
  }

  function buildLocalPaletteResults(query) {
    const normalized = normalizeQuery(query);
    const impersonationQuery = getImpersonationQuery(query);

    const commands = BASE_COMMANDS
      .filter(isPaletteCommandAvailable)
      .map(item => ({
        ...item,
        aliasMatch: getCommandAliasId(normalized) === item.id,
        kind: item.kind || 'Tools'
      }))
      .filter(item => impersonationQuery === null && (item.aliasMatch || fuzzyMatch(`${item.id} ${item.title} ${item.subtitle} ${item.keywords.join(' ')}`, normalized)))
      .map(item => ({
        ...item,
        displayTitle: `/${item.aliasMatch ? normalized : item.id}`
      }))
      .sort((a, b) =>
        Number(b.aliasMatch) - Number(a.aliasMatch) ||
        rankMatch(b.title, b.id, b.keywords, normalized) - rankMatch(a.title, a.id, a.keywords, normalized)
      );

    const customCmds = HU.customCommands
      .filter(cmd => impersonationQuery === null && fuzzyMatch(`${cmd.title} ${cmd.subtitle || ''} ${cmd.category || ''}`, normalized))
      .map(cmd => ({
        id: cmd.id,
        title: cmd.title,
        subtitle: cmd.subtitle || (cmd.type === 'sql' ? 'SQL command' : cmd.url || ''),
        kind: cmd.category || (cmd.type === 'navigation' ? 'Navigation' : 'SQL'),
        type: cmd.type,
        url: cmd.url,
        sql: cmd.sql
      }))
      .sort((a, b) => rankMatch(b.title, b.title, [], normalized) - rankMatch(a.title, a.title, [], normalized));

    const shortcuts = HU.shortcuts
      .filter(item => fuzzyMatch(`${item.title} ${item.url}`, normalized))
      .slice(0, 8)
      .map(item => ({
        title: item.title,
        subtitle: item.url,
        kind: 'Shortcuts',
        type: 'navigate',
        url: item.url
      }));

    const recent = getCachedRecent()
      .filter(item => impersonationQuery === null && fuzzyMatch(`${item.title} ${item.type} ${item.url}`, normalized))
      .slice(0, 8)
      .map(item => ({
        title: item.title,
        subtitle: item.url,
        kind: 'Recent',
        type: 'navigate',
        url: item.url
      }));

    if (impersonationQuery !== null) {
      if (!impersonationQuery && HU.impersonatedAgentId) {
        return [{
          title: 'Exit impersonation',
          subtitle: `Switch back from impersonated agent ${HU.impersonatedAgentId}`,
          kind: 'Tools',
          type: 'command',
          run: exitImpersonation
        }];
      }
      return [];
    }
    const ticketTypeCmds = [];

    if (!normalized) return getDefaultCommandResults();
    return [...commands, ...ticketTypeCmds, ...customCmds, ...shortcuts, ...recent].slice(0, 28);
  }

  function updatePaletteFooter(query) {
    const footer = document.getElementById('hu-palette-footer');
    if (!footer) return;

    const impersonationQuery = getImpersonationQuery(query);
    const entityQuery = getEntitySearchQuery(query);
    let title, subtitle;

    if (impersonationQuery !== null) {
      title = getImpersonationFooterTitle(impersonationQuery);
      subtitle = getImpersonationFooterSubtitle(impersonationQuery);
    } else if (entityQuery) {
      title = `Searching ${entityQuery.def.kind} records for "${entityQuery.searchTerm}"`;
      subtitle = `Press Enter to open the top match, or keep typing to refine. Use /${entityQuery.def.commandId} alone to open the list.`;
    } else {
      title = 'Tip: type /h for HaloPlus commands';
      subtitle = 'Try "/t 2937", "/c Acme", or "/a alex" to search within a record type.';
    }

    footer.innerHTML = `
      <span>
        <span class="hu-result-title">${escapeHtml(title)}</span>
        <span class="hu-result-sub">${escapeHtml(subtitle)}</span>
      </span>
    `;
  }

  function getImpersonationQuery(query) {
    const normalized = normalizeQuery(query);
    if (normalized === 'imp') return '';
    if (normalized.startsWith('imp ')) return normalized.replace(/^imp\s+/, '').trim();
    return null;
  }

  function getImpersonationFooterTitle(query) {
    if (!query && HU.impersonatedAgentId) return 'Press Enter to switch back';
    return query ? `Searching agents for "${query}"` : 'Type an agent name or ID';
  }

  function getImpersonationFooterSubtitle(query) {
    if (!query && HU.impersonatedAgentId) return `Currently impersonating agent ${HU.impersonatedAgentId}`;
    return 'Select an agent to start Halo impersonation';
  }

  async function runImpersonationCommand() {
    if (HU.impersonatedAgentId) {
      await exitImpersonation();
      return;
    }
    openPalette('imp ');
  }

  async function searchAgentsForImpersonation(query) {
    const escaped = sqlEscape(query);
    const numeric = /^\d+$/.test(query);
    const where = numeric
      ? `UNum = ${Number(query)} OR UName LIKE '%${escaped}%' OR USMTP LIKE '%${escaped}%'`
      : `UName LIKE '%${escaped}%' OR USMTP LIKE '%${escaped}%' OR CAST(UNum AS nvarchar(30)) LIKE '%${escaped}%'`;
    const sql = `
SELECT TOP 10
  UNum AS [id],
  UName AS [title],
  USMTP AS [subtitle]
FROM
  uname
WHERE
  ${where}
ORDER BY
  UName
`.trim();

    const payload = await runHaloReport(sql, 'HaloPlus Impersonation Agent Search');
    return extractRows(payload).map(row => ({
      title: row.title || `Agent ${row.id}`,
      subtitle: `${row.subtitle || 'Agent'} - UName.UNum = ${row.id}`,
      kind: 'Impersonate',
      type: 'impersonate',
      agentId: row.id
    }));
  }

  async function searchHaloRecords(query) {
    const escaped = sqlEscape(query);
    const numeric = /^\d+$/.test(query);
    const clauses = numeric ? [] : [
      searchSql('Ticket',     'ticket',   'faults',   'Faultid', 'Symptom',   'Username', `CAST(Faultid AS nvarchar(30)) LIKE '%${escaped}%' OR Symptom LIKE '%${escaped}%' OR Username LIKE '%${escaped}%'`),
      searchSql('Customer',   'customer', 'area',     'AArea',   'AAreaDesc', 'AMemo',    `CAST(AArea AS nvarchar(30)) LIKE '%${escaped}%' OR AAreaDesc LIKE '%${escaped}%'`),
      searchSql('Agent',      'agent',    'uname',    'UNum',    'UName',     'USMTP',    `CAST(UNum AS nvarchar(30)) LIKE '%${escaped}%' OR UName LIKE '%${escaped}%' OR USMTP LIKE '%${escaped}%'`),
      searchSql('User',       'user',     'users',    'uid',     'UUsername', 'UEmail',   `CAST(uid AS nvarchar(30)) LIKE '%${escaped}%' OR UUsername LIKE '%${escaped}%' OR UEmail LIKE '%${escaped}%'`),
      searchSql('Asset',      'asset',    'device',   'DID',     'DInvNo',    'DID',      `DID LIKE '%${escaped}%' OR DInvNo LIKE '%${escaped}%'`),
      searchSql('KB Article', 'kb',       'kbentry',  'kbid',    'Abstract',  'Abstract', `Abstract LIKE '%${escaped}%'`),
      searchSql('Invoice',    'invoice',  'invoiceheader', 'ihid', 'IH3rdPartyInvoiceNumber', 'IHname', `CAST(ihid AS nvarchar(30)) LIKE '%${escaped}%' OR IH3rdPartyInvoiceNumber LIKE '%${escaped}%' OR IHname LIKE '%${escaped}%'`),
      searchSql('Quote',      'quote',    'quotationheader', 'qhid', 'QHtitle', 'QHPORef', `CAST(qhid AS nvarchar(30)) LIKE '%${escaped}%' OR QHtitle LIKE '%${escaped}%' OR QHPORef LIKE '%${escaped}%'`),
      searchSql('Purchase Order', 'purchase', 'supplierorderheader', 'SHid', 'SHtitle', 'SHPORef', `CAST(SHid AS nvarchar(30)) LIKE '%${escaped}%' OR SHtitle LIKE '%${escaped}%' OR SHPORef LIKE '%${escaped}%'`)
    ];

    if (numeric) {
      clauses.push(searchSql('Ticket',     'ticket',   'faults',  'Faultid', 'Symptom',   'Username', `Faultid = ${Number(query)}`));
      clauses.push(searchSql('Customer',   'customer', 'area',    'AArea',   'AAreaDesc', 'AMemo',    `AArea = ${Number(query)}`));
      clauses.push(searchSql('Agent',      'agent',    'uname',   'UNum',    'UName',     'USMTP',    `UNum = ${Number(query)}`));
      clauses.push(searchSql('User',       'user',     'users',   'uid',     'UUsername', 'UEmail',   `uid = ${Number(query)}`));
      clauses.push(searchSql('KB Article', 'kb',       'kbentry', 'kbid',    'Abstract',  'Abstract', `kbid = ${Number(query)}`));
      clauses.push(searchSql('Invoice',    'invoice',  'invoiceheader', 'ihid', 'IH3rdPartyInvoiceNumber', 'IHname', `ihid = ${Number(query)}`));
      clauses.push(searchSql('Quote',      'quote',    'quotationheader', 'qhid', 'QHtitle', 'QHPORef', `qhid = ${Number(query)}`));
      clauses.push(searchSql('Purchase Order', 'purchase', 'supplierorderheader', 'SHid', 'SHtitle', 'SHPORef', `SHid = ${Number(query)}`));
    }

    const batches = await Promise.allSettled(clauses.map(item => runSearchQuery(item)));
    return batches.flatMap(result => result.status === 'fulfilled' ? result.value : []).slice(0, 20);
  }

  function searchSql(kind, routeType, table, idColumn, titleColumn, subtitleColumn, where) {
    return { kind, routeType, table, idColumn, titleColumn, subtitleColumn, where };
  }

  function buildSearchSql(def, withExtras, withType) {
    const extraCols = withExtras ? (def.extraCols || []) : [];
    const extraSelect = extraCols.map((expr, i) => `  ${expr} AS [extra${i}]`).join(',\n');
    const typeClause = withType && def.typeId ? ` AND RequestTypeNew = ${Number(def.typeId)}` : '';
    const fullWhere = typeClause ? `(${def.where})${typeClause}` : def.where;
    const orderBy = def.searchTerm
      ? `\nORDER BY\n  ${buildSqlSearchOrder(def.idColumn, def.titleColumn, def.subtitleColumn, def.searchTerm)}`
      : '';
    return {
      sql: `
SELECT TOP 5
  ${def.idColumn} AS [id],
  ${def.titleColumn} AS [title],
  ${def.subtitleColumn} AS [subtitle]${extraSelect ? ',\n' + extraSelect : ''}
FROM
  ${def.table}
WHERE
  ${fullWhere}
${orderBy}
`.trim(),
      extraCols
    };
  }

  async function runSearchQuerySql(def, withExtras, withType) {
    const built = buildSearchSql(def, withExtras, withType);
    const payload = await runHaloReport(built.sql, `HaloPlus ${def.kind} Search`);
    const err = getReportLoadError(payload);
    if (err) throw new Error(err);
    return { payload, extraCols: built.extraCols };
  }

  async function runSearchQuery(def) {
    const hasExtras = (def.extraCols || []).length > 0;
    const hasType = !!def.typeId;
    // Degrade: extras and type, then no extras, then no type.
    const attempts = [];
    if (hasExtras && hasType) attempts.push([true, true]);
    if (hasType)              attempts.push([false, true]);
                              attempts.push([false, false]);
    let lastErr;
    for (const [extras, type] of attempts) {
      try {
        const { payload, extraCols } = await runSearchQuerySql(def, extras, type);
        return extractRows(payload).map(row => {
          const parts = [row.subtitle, ...extraCols.map((_, i) => row[`extra${i}`])]
            .map(v => (v == null ? '' : String(v)).trim())
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i);
          return {
            id: row.id,
            recordId: row.id,
            title: formatSearchResultTitle(def, row),
            subtitle: parts.join(' | ') || `${def.table}.${def.idColumn} = ${row.id}`,
            kind: def.kind,
            type: 'navigate',
            url: new URL(routeDetail(def.routeType, row.id), window.location.origin).href
          };
        });
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  function formatSearchResultTitle(def, row) {
    if (def.routeType === 'ticket') {
      const num = formatTicketNumber(row.id);
      if (def.emailTag) {
        const tag = typeof def.emailTag === 'object' ? def.emailTag : { start: def.emailTag, end: ']' };
        return `${tag.start}${num}${tag.end} - ${row.title || 'Untitled ticket'}`;
      }
      if (def.ticketPrefix) {
        return `[${def.ticketPrefix}] ${num} - ${row.title || 'Untitled ticket'}`;
      }
      return `${num} - ${row.title || 'Untitled ticket'}`;
    }
    return row.title || `${def.kind} ${row.id}`;
  }

  function formatTicketNumber(value) {
    const id = String(value || '').replace(/\D/g, '');
    return id ? id.padStart(7, '0') : String(value || '');
  }

  function makePaletteButton(item, index) {
    const button = document.createElement('button');
    button.className = `hu-result ${index === HU.selectedIndex ? 'hu-active' : ''}`;
    button.dataset.resultIndex = String(index);
    button.innerHTML = `
      <span>
        <span class="hu-result-title">${escapeHtml(item.displayTitle || item.title)}</span>
        <span class="hu-result-sub">${escapeHtml(item.subtitle || '')}</span>
      </span>
      <span class="hu-result-kind">${escapeHtml(item.kind || item.type || 'Action')}</span>
    `;
    button.addEventListener('mouseenter', () => {
      setPaletteSelection(index);
    });
    button.addEventListener('click', () => activateResult(item));
    return button;
  }

  function makeShowAllButton(item, index) {
    const button = makePaletteButton(item, index);
    button.classList.add('hu-show-all-result');
    return button;
  }

  function setPaletteSelection(index) {
    HU.selectedIndex = index;
    const list = document.getElementById('hu-palette-list');
    list?.querySelectorAll('.hu-result').forEach(node => {
      node.classList.toggle('hu-active', Number(node.dataset.resultIndex) === index);
    });
  }

  function renderPaletteResults(results, grouped = false) {
    const list = document.getElementById('hu-palette-list');
    if (!list) return;
    HU.paletteGrouped = grouped;

    if (!results.length) {
      const input = document.getElementById('hu-palette-input');
      if (getImpersonationQuery(input?.value || '') !== null) {
        list.innerHTML = '';
        return;
      }
      list.innerHTML = '<div class="hu-row"><span class="hu-row-title">No matches</span><span class="hu-row-sub">Try a ticket number, customer name, setting name, or built-in command.</span></div>';
      return;
    }

    list.innerHTML = '';

    if (grouped) {
      const groups = new Map();
      results.forEach((item, index) => {
        const g = item.kind || 'Tools';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push({ item, index });
      });
      groups.forEach((entries, group) => {
        const section = document.createElement('div');
        section.className = 'hu-row hu-section-row';
        section.innerHTML = `<span class="hu-section-label">${escapeHtml(group)}</span>`;
        list.appendChild(section);
        entries.forEach(({ item, index }) => list.appendChild(makePaletteButton(item, index)));
      });
    } else {
      results.forEach((item, index) => {
        const button = item.type === 'show-all' ? makeShowAllButton(item, index) : makePaletteButton(item, index);
        list.appendChild(button);
      });
    }
  }

  async function activateResult(item) {
    if (item.type === 'show-all') {
      HU.paletteShowAll = true;
      HU.paletteResults = getDefaultCommandResults();
      HU.selectedIndex = Math.min(HU.selectedIndex, HU.paletteResults.length - 1);
      renderPaletteResults(HU.paletteResults, false);
      return;
    }

    closePalette();
    await trackRecentCommand(item).catch(() => {});
    if (item.type === 'command') { item.run(); return; }
    if (item.type === 'navigation' && item.url) { navigateTo(item.url); return; }
    if (item.type === 'navigate' && item.url) { navigateTo(item.url); return; }
    if (item.type === 'sql' && item.sql) { runCustomSqlCommand(item.title, item.sql); return; }
    if (item.type === 'impersonate') { impersonateAgent(item.agentId, item.title); }
  }

  async function runCustomSqlCommand(title, sql) {
    injectStyles();
    closeDrawer('hu-sql-drawer');
    const drawer = createDrawer('hu-sql-drawer', `/${escapeHtml(title)}`);
    const body = drawer.querySelector('.hu-drawer-body');
    body.innerHTML = '<div class="hu-row"><span class="hu-row-title">Running query...</span></div>';
    openDrawer(drawer);

    try {
      const payload = await runHaloReport(sql, `HaloPlus /${title}`);
      const rows = extractRows(payload);
      if (!rows.length) {
        body.innerHTML = '<div class="hu-row"><span class="hu-row-title">No results</span><span class="hu-row-sub">The query returned no rows.</span></div>';
        return;
      }
      body.innerHTML = '';
      const columns = Object.keys(rows[0]);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'overflow:auto;';
      const table = document.createElement('table');
      table.style.cssText = 'border-collapse:collapse;width:100%;font-size:12px;';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        th.style.cssText = 'padding:5px 8px;text-align:left;border-bottom:2px solid #e3e7ef;font-size:11px;color:#667085;font-weight:600;white-space:nowrap;';
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      const tbody = document.createElement('tbody');
      rows.forEach((row, ri) => {
        const tr = document.createElement('tr');
        tr.style.background = ri % 2 ? '#f8fafc' : '';
        columns.forEach(col => {
          const td = document.createElement('td');
          td.textContent = row[col] ?? '';
          td.style.cssText = 'padding:4px 8px;border-bottom:1px solid #edf0f5;font-size:12px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(thead);
      table.appendChild(tbody);
      wrap.appendChild(table);
      body.appendChild(wrap);
      const meta = document.createElement('div');
      meta.style.cssText = 'padding:7px 10px;font-size:11px;color:#667085;border-top:1px solid #e3e7ef;flex-shrink:0;';
      meta.textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''}`;
      drawer.appendChild(meta);
    } catch (err) {
      body.innerHTML = `<div class="hu-row"><span class="hu-row-title">Query failed</span><span class="hu-row-sub">${escapeHtml(err.message)}</span></div>`;
    }
  }

  async function impersonateAgent(agentId, agentName) {
    if (!agentId) {
      toast('No agent selected');
      return;
    }

    try {
      toast(`Starting impersonation for ${agentName || `agent ${agentId}`}...`);
      const payload = await postHaloJson('/api/ImpersonationRequest', { agent: String(agentId) });
      const redirect = findImpersonationRedirect(payload);
      HU.impersonatedAgentId = String(agentId);
      await storageSet({ huImpersonatedAgentId: String(agentId) });
      window.location.assign(buildCurrentPageImpersonationUrl(redirect));
    } catch (error) {
      toast(`Could not impersonate agent: ${error.message}`);
    }
  }

  function buildCurrentPageImpersonationUrl(redirect) {
    const url = new URL(window.location.href);
    url.searchParams.delete('switchback');

    const actAs = extractActAsToken(redirect);
    if (actAs) url.searchParams.set('act_as', actAs);

    return url.href;
  }

  function extractActAsToken(redirect) {
    if (!redirect) return '';

    try {
      const parsed = new URL(redirect, window.location.origin);
      const actAs = parsed.searchParams.get('act_as');
      if (actAs) return actAs;
    } catch (e) {
      // Fall through to raw query parsing.
    }

    const query = String(redirect).includes('?')
      ? String(redirect).split('?').slice(1).join('?')
      : String(redirect);
    const params = new URLSearchParams(query);
    return params.get('act_as') || '';
  }

  function findImpersonationRedirect(payload) {
    const strings = [];
    const visit = value => {
      if (!value) return;
      if (typeof value === 'string') {
        strings.push(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(payload);

    const url = strings.find(value => /^https?:\/\//i.test(value) || value.startsWith('/') || value.includes('act_as='));
    if (url) return url.includes('act_as=') && !/^https?:\/\//i.test(url) && !url.startsWith('/') ? `/home?${url}` : url;

    const jwt = strings.find(value => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value));
    return jwt ? `/home?act_as=${encodeURIComponent(jwt)}` : '';
  }

  async function exitImpersonation() {
    const url = new URL(window.location.href);

    url.searchParams.delete('act_as');
    url.searchParams.set('switchback', 'true');
    HU.impersonatedAgentId = '';
    await storageSet({ huImpersonatedAgentId: '' });
    window.location.assign(url.href);
  }

  async function loadImpersonationState() {
    const data = await storageGet(['huImpersonatedAgentId']);
    HU.impersonatedAgentId = data.huImpersonatedAgentId || '';
    if (new URL(window.location.href).searchParams.get('switchback') === 'true') {
      HU.impersonatedAgentId = '';
      await storageSet({ huImpersonatedAgentId: '' });
    }
  }

  function fuzzyMatch(haystack, query) {
    if (!query) return true;
    const normalizedHaystack = normalizeQuery(haystack);
    return query.split(/\s+/).every(part => normalizedHaystack.includes(part));
  }

  function normalizeQuery(value) {
    return String(value || '').toLowerCase().trim().replace(/^\/+/, '');
  }

  function sqlEscape(value) {
    return String(value).replace(/'/g, "''");
  }

  async function loadShortcuts() {
    const data = await storageGet(['huShortcuts']);
    HU.shortcuts = data.huShortcuts || [];
    return HU.shortcuts;
  }

  async function loadCustomCommands() {
    const data = await storageGet(['huCustomCommands']);
    HU.customCommands = data.huCustomCommands || [];
  }

  async function loadRecentCommands() {
    const data = await storageGet(['huRecentCommands']);
    HU.recentCommands = data.huRecentCommands || [];
    return HU.recentCommands;
  }

  function getRecentCommandResults() {
    return (HU.recentCommands || [])
      .map(entry => resolveRecentCommand(entry))
      .filter(Boolean)
      .slice(0, 10);
  }

  function getDefaultCommandResults() {
    const allCommands = getPaletteCommandCatalog();
    if (HU.paletteShowAll || allCommands.length <= 10) return allCommands;

    const visible = allCommands.slice(0, 10);
    const hiddenCount = allCommands.length - visible.length;
    return [
      ...visible,
      {
        title: `+${hiddenCount}`,
        subtitle: 'Show all commands',
        kind: '',
        type: 'show-all'
      }
    ];
  }

  function getPaletteCommandCatalog() {
    const seen = new Set();
    const addUnique = (items, output) => {
      items.forEach(item => {
        const key = getRecentCommandKey(item) || `${item.type}:${item.id || item.title}`;
        if (!key || seen.has(key)) return;
        if (!isPaletteCommandAvailable(item)) return;
        seen.add(key);
        output.push(item);
      });
    };

    const output = [];
    addUnique(getRecentCommandResults(), output);
    addUnique(getBuiltinCommandResults(), output);
    addUnique(getCustomCommandResults(), output);
    return output;
  }

  function getBuiltinCommandResults() {
    return BASE_COMMANDS
      .filter(isPaletteCommandAvailable)
      .map(command => ({
        ...command,
        displayTitle: `/${command.id}`,
        subtitle: command.subtitle ? `${command.title} - ${command.subtitle}` : command.title,
        kind: command.kind || 'Tools'
      }));
  }

  function isPaletteCommandAvailable(item) {
    if (!item) return false;
    if (['360', 'tl'].includes(item.id)) return Boolean(getCurrentTicketId());
    if (item.id === 'j') return Boolean(detectRecordFromUrl());
    if (item.id === 'f') return Boolean(document.body);
    return true;
  }

  function getCustomCommandResults() {
    return HU.customCommands.map(cmd => ({
      id: cmd.id,
      displayTitle: `/${cmd.title}`,
      title: cmd.title,
      subtitle: cmd.subtitle || (cmd.type === 'sql' ? 'SQL command' : cmd.url || ''),
      kind: cmd.category || (cmd.type === 'navigation' ? 'Navigation' : 'SQL'),
      type: cmd.type,
      url: cmd.url,
      sql: cmd.sql
    }));
  }

  function buildSqlSearchOrder(idColumn, titleColumn, subtitleColumn, searchTerm) {
    const escaped = sqlEscape(searchTerm);
    const numeric = /^\d+$/.test(searchTerm);
    const idExpr = `CONVERT(nvarchar(max), ${idColumn})`;
    const titleExpr = `CONVERT(nvarchar(max), ${titleColumn})`;
    const subtitleExpr = `CONVERT(nvarchar(max), ${subtitleColumn})`;
    const numericExact = numeric ? `WHEN ${idColumn} = ${Number(searchTerm)} THEN 0` : '';
    return `
  CASE
    ${numericExact}
    WHEN ${idExpr} = '${escaped}' THEN 1
    WHEN ${idExpr} LIKE '${escaped}%' THEN 2
    WHEN ${idExpr} LIKE '%${escaped}%' THEN 3
    WHEN ${titleExpr} = '${escaped}' THEN 4
    WHEN ${titleExpr} LIKE '${escaped}%' THEN 5
    WHEN ${subtitleExpr} LIKE '${escaped}%' THEN 6
    WHEN ${titleExpr} LIKE '%${escaped}%' THEN 7
    WHEN ${subtitleExpr} LIKE '%${escaped}%' THEN 8
    ELSE 9
  END,
  ${titleExpr}
`.trim();
  }

  function resolveRecentCommand(entry) {
    if (!entry?.key) return null;

    if (entry.key.startsWith('base:')) {
      const id = entry.key.slice(5);
      const command = BASE_COMMANDS.find(item => item.id === id)
        || HU.ticketTypeCommands.find(item => item.id === id);
      if (!isPaletteCommandAvailable(command)) return null;
      return command ? {
        ...command,
        displayTitle: entry.displayTitle || `/${command.id}`,
        subtitle: command.subtitle ? `${command.title} - ${command.subtitle}` : command.title,
        kind: command.kind || 'Tools'
      } : null;
    }

    if (entry.key.startsWith('custom:')) {
      const id = entry.key.slice(7);
      const cmd = HU.customCommands.find(item => item.id === id);
      if (!cmd) return null;
      return {
        id: cmd.id,
        displayTitle: entry.displayTitle || `/${cmd.title}`,
        title: cmd.title,
        subtitle: cmd.subtitle || (cmd.type === 'sql' ? 'SQL command' : cmd.url || ''),
        kind: cmd.category || (cmd.type === 'navigation' ? 'Navigation' : 'SQL'),
        type: cmd.type,
        url: cmd.url,
        sql: cmd.sql
      };
    }

    return null;
  }

  async function trackRecentCommand(item) {
    const key = getRecentCommandKey(item);
    if (!key) return;

    const entry = {
      key,
      title: item.title || '',
      displayTitle: item.displayTitle || '',
      subtitle: item.subtitle || '',
      kind: item.kind || '',
      usedAt: new Date().toISOString()
    };
    const next = [entry, ...HU.recentCommands.filter(command => command.key !== key)].slice(0, 10);
    HU.recentCommands = next;
    await storageSet({ huRecentCommands: next });
  }

  function getRecentCommandKey(item) {
    if (!item) return '';
    const isBaseCommand = item.type === 'command' && item.id;
    if (isBaseCommand) return `base:${item.id}`;
    const isCustomCommand = (item.type === 'navigation' || item.type === 'sql') && item.id;
    return isCustomCommand ? `custom:${item.id}` : '';
  }

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function getTicketAreaForType(typeId, name) {
    const normalized = String(name || '').toLowerCase();
    if (normalized.includes('major incident')) return 13;
    if (normalized.includes('article draft')) return 10;
    if (normalized.includes('facilities') || normalized.includes('facility') ||
      normalized.includes('air con') || normalized.includes('building') ||
      normalized.includes('electrical') || normalized.includes('parking') ||
      normalized.includes('plumbing') || normalized.includes('event request')) return 9;
    if (normalized.includes('hr ') || normalized.includes('human resources') ||
      normalized.includes('payroll') || normalized.includes('employment') ||
      normalized.includes('absence') || normalized.includes('benefit') ||
      normalized.includes('employee') || normalized.includes('grievance') ||
      normalized.includes('retirement')) return 8;
    if (normalized.includes('project')) return 7;
    if (normalized.includes('change')) return 3;
    if (normalized.includes('problem')) return 2;
    if (normalized.includes('incident')) return 1;
    return 4;
  }

  async function loadTicketTypes() {
    try {
      let types = [];

      // SQL: rtGID holds the email start tag (e.g. "[IN-"), rtGIDEND holds the closing (e.g. "]").
      try {
        const rows = extractRows(await runHaloReport(
          `SELECT RTid AS [id], rtdesc AS [name], ISNULL(rtGID, '') AS [rtGID], ISNULL(rtGIDEND, '') AS [rtGIDEND] FROM requesttype`,
          'HaloPlus Request Types'
        ));
        if (rows.length) types = rows;
      } catch (_) {}

      // Static schema as last resort
      if (!types.length) {
        const resp = await fetch(chrome.runtime.getURL('schema/requesttypes.json'));
        types = await resp.json();
      }

      HU.ticketTypeCommands = [];
      HU.ticketTypeSearchMap = {};

      types.forEach((type) => {
        const id = type.id || type.RTID;
        const name = type.name || type.RTDesc || type.Name || '';
        const gidStart = type.rtGID || type.override_email_start_tag || type.overrideEmailStartTag || type.OverrideEmailStartTag || null;
        const gidEnd = type.rtGIDEND || ']';
        const emailTag = gidStart ? { start: gidStart, end: gidEnd } : null;
        const slug = slugify(name);
        const typeId = Number(id);
        const areaId = getTicketAreaForType(typeId, name);

        HU.ticketTypeCommands.push({
          id: slug,
          title: name,
          subtitle: `Open ${name} ticket list`,
          run: () => window.location.assign(new URL(`/tickets?area=${areaId}`, window.location.origin).href),
          keywords: [slug],
          type: 'command',
          kind: 'Ticket Types'
        });

        HU.ticketTypeSearchMap[slug] = {
          commandId: slug,
          kind: name,
          route: 'ticket',
          table: 'faults',
          id: 'Faultid',
          title: 'Symptom',
          sub: 'Username',
          extraCols: ['AAreaDesc'],
          searchCols: ['Symptom', 'Username'],
          optionalSearchCols: ['Symptom2', 'FDescription'],
          emailTag,
          ticketPrefix: emailTag ? null : getTicketTypePrefix(name),
          typeId,
          areaId
        };
      });

      patchTicketEntryEmailTags(types);
    } catch (e) {
      // Non-critical - extension works without ticket type data
    }
  }

  function patchTicketEntryEmailTags(types) {
    const tagByName = {};
    const idByName = {};

    types.forEach(type => {
      const name = String(type.name || type.RTDesc || type.Name || '').toLowerCase().trim();
      if (!name) return;
      const id = type.id || type.RTid || type.RTID;
      if (id) idByName[name] = Number(id);
      const gidStart = type.rtGID || type.override_email_start_tag || type.overrideEmailStartTag || type.OverrideEmailStartTag || null;
      if (gidStart) tagByName[name] = { start: gidStart, end: type.rtGIDEND || ']' };
    });

    // [typeNames, keywords, opts], where opts.applyTypeId defaults to true.
    const nameMappings = [
      [['incident'],                            ['incident', 'incidents', 'i']],
      [['incident'],                            ['ticket', 'tickets', 't'],    { applyTypeId: false, applyEmailTag: false }],
      [['problem'],                             ['prob']],
      [['change request', 'change'],            ['chg']],
      [['service request', 'request'],          ['req']],
      [['hr enquiry', 'hr', 'human resources'], ['hr']],
      [['facilities change request', 'facilities', 'facility'], ['fac']],
      [['article draft', 'draft'],              ['dft']],
      [['project'],                             ['prj']],
      [['major incident'],                      ['mi']],
    ];

    nameMappings.forEach(([typeNames, keywords, opts = {}]) => {
      const tag = typeNames.reduce((found, n) => found || tagByName[n], null);
      const typeId = typeNames.reduce((found, n) => found || idByName[n], null);
      if (!tag && !typeId) return;
      keywords.forEach(kw => {
        if (!ENTITY_SEARCH_MAP[kw]) return;
        const patch = {};
        if (tag && opts.applyEmailTag !== false) patch.emailTag = tag;
        else if (opts.applyEmailTag === false) { patch.emailTag = null; patch.ticketPrefix = null; }
        if (typeId && opts.applyTypeId !== false) patch.typeId = typeId;
        ENTITY_SEARCH_MAP[kw] = { ...ENTITY_SEARCH_MAP[kw], ...patch };
      });
    });
  }

  async function addCurrentPageShortcut() {
    const title = cleanTitle(document.title) || window.location.pathname;
    const shortcut = {
      title,
      url: window.location.href,
      createdAt: new Date().toISOString()
    };
    const existing = await loadShortcuts();
    const next = [shortcut, ...existing.filter(item => item.url !== shortcut.url)].slice(0, 50);
    await storageSet({ huShortcuts: next });
    HU.shortcuts = next;
    toast('Shortcut added');
  }

  function getCachedRecent() {
    return HU.recent || [];
  }

  function getTicketTypePrefix(name) {
    const normalized = String(name || '').trim();
    const known = {
      incident: 'INC',
      problem: 'PRB',
      'change request': 'CHG',
      'service request': 'REQ',
      project: 'PRJ',
      'major incident': 'MI',
      'article draft': 'DFT'
    };
    const exact = known[normalized.toLowerCase()];
    if (exact) return exact;

    const words = normalized.match(/[A-Za-z0-9]+/g) || [];
    if (!words.length) return 'TKT';
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words
      .filter(word => !/^(and|or|for|of|the|a|an)$/i.test(word))
      .slice(0, 3)
      .map(word => word[0])
      .join('')
      .toUpperCase() || 'TKT';
  }

  async function loadRecent() {
    const data = await storageGet(['huRecentRecords']);
    HU.recent = data.huRecentRecords || [];
    return HU.recent;
  }

  async function trackRecentRecord() {
    const record = detectRecordFromUrl();
    if (!record || record.url === HU.lastTrackedUrl) return;
    HU.lastTrackedUrl = record.url;

    const recent = await loadRecent();
    const next = [record, ...recent.filter(item => item.url !== record.url)].slice(0, 20);
    HU.recent = next;
    await storageSet({ huRecentRecords: next });
  }

  function detectRecordFromUrl() {
    const url = new URL(window.location.href);
    const text = url.href.toLowerCase();
    const id = url.searchParams.get('agentid') ||
      url.searchParams.get('userid') ||
      url.searchParams.get('clientid') ||
      url.searchParams.get('assetid') ||
      url.searchParams.get('id') ||
      url.searchParams.get('faultid') ||
      url.searchParams.get('selid') ||
      '';
    const title = cleanTitle(document.title) || `${url.pathname}${id ? ` ${id}` : ''}`;
    let type = '';

    if (text.includes('/ticket') || text.includes('/fault')) type = 'ticket';
    else if (text.includes('/customer') || text.includes('/area') || text.includes('/client')) type = 'customer';
    else if (text.includes('/agent') || text.includes('/uname')) type = 'agent';
    else if (text.includes('/user')) type = 'user';
    else if (text.includes('/asset') || text.includes('/device')) type = 'asset';
    else if (text.includes('/report')) type = 'report';
    else if (text.includes('/config')) type = 'config';

    if (!type) return null;
    return {
      type,
      id,
      title,
      url: window.location.href,
      visitedAt: new Date().toISOString()
    };
  }

  function showRecentPanel() {
    injectStyles();
    closeDrawer('hu-json-drawer');
    closeDrawer('hu-recent-drawer');

    const drawer = createDrawer('hu-recent-drawer', 'Recent records');
    const body = drawer.querySelector('.hu-drawer-body');
    const recent = getCachedRecent();

    if (!recent.length) {
      body.innerHTML = '<div class="hu-row"><span class="hu-row-title">No recent records yet</span><span class="hu-row-sub">Visit tickets, customers, agents, assets, reports, or config pages and they will appear here.</span></div>';
    } else {
      recent.forEach(item => {
        const row = document.createElement('button');
        row.className = 'hu-row';
        row.innerHTML = `
          <span class="hu-row-title">${escapeHtml(item.title)}</span>
          <span class="hu-row-sub">${escapeHtml(item.type)}${item.id ? ` ${escapeHtml(item.id)}` : ''} - ${escapeHtml(item.url)}</span>
        `;
        row.addEventListener('click', () => navigateTo(item.url));
        body.appendChild(row);
      });
    }
    openDrawer(drawer);
  }

  function showApiReference() {
    injectStyles();
    closeDrawer('hu-json-drawer');
    closeDrawer('hu-recent-drawer');
    closeDrawer('hu-help-drawer');
    closeDrawer('hu-api-drawer');

    const drawer = createDrawer('hu-api-drawer', 'Halo REST API reference');
    const body = drawer.querySelector('.hu-drawer-body');

    API_RESOURCES.forEach(section => {
      const heading = document.createElement('div');
      heading.className = 'hu-row hu-section-row';
      heading.innerHTML = `<span class="hu-section-label">${escapeHtml(section.category)}</span>`;
      body.appendChild(heading);

      section.endpoints.forEach(ep => {
        const row = document.createElement('div');
        row.className = 'hu-row hu-api-row';
        row.innerHTML = `
          <span class="hu-api-row-inner">
            <span>
              <span class="hu-row-title" style="font-family:monospace;font-size:12px">${escapeHtml(ep.path)}</span>
              <span class="hu-row-sub">${escapeHtml(ep.desc)}</span>
            </span>
            <button class="hu-copy hu-method-badge" title="Copy path">${escapeHtml(ep.methods)}</button>
          </span>
        `;
        const copyBtn = row.querySelector('.hu-method-badge');
        copyBtn.addEventListener('click', () => {
          navigator.clipboard?.writeText(ep.path).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = ep.methods; }, 1500);
          });
        });
        body.appendChild(row);
      });
    });

    openDrawer(drawer);
  }

  function showHelpPanel() {
    injectStyles();
    closeDrawer('hu-json-drawer');
    closeDrawer('hu-recent-drawer');
    closeDrawer('hu-help-drawer');

    const drawer = createDrawer('hu-help-drawer', 'HaloPlus help');
    const body = drawer.querySelector('.hu-drawer-body');
    const items = [
      ['/', 'Open the command palette'],
      ['Enter', 'Open the selected result'],
      ['Esc', 'Close the palette or panel'],
      ['Arrow Up / Down', 'Move through results'],
      ['/t 2937', 'Open or search tickets by ID or text'],
      ['/i 2937', 'Open or search incidents by ID or text'],
      ['/c acme', 'Search customers by name or ID'],
      ['/a alex', 'Search agents by name or ID'],
      ['/u sam', 'Search users by name or ID'],
      ['/s london', 'Search sites by name or ID'],
      ['/asset abc', 'Search assets by tag or ID'],
      ['/prob', 'Open problems'],
      ['/chg', 'Open change requests'],
      ['/req', 'Open requests'],
      ['/prj', 'Open projects'],
      ['/cfg', 'Open configuration'],
      ['/rep', 'Open reports'],
      ['/kb', 'Open the knowledge base'],
      ['/r', 'Open recent Halo records'],
      ['/360', 'Open Ticket 360 for the current ticket'],
      ['/tl', 'Open the current ticket action timeline'],
      ['/f', 'Toggle API field names'],
      ['/j', 'Inspect the current record payload'],
      ['/api', 'Browse all Halo REST API endpoints'],
      ['/imp alex', 'Search agents and impersonate the selected agent'],
      ['/xi', 'Exit the impersonated Halo session'],
      ['/sc', 'Save the current page as a shortcut']
    ];

    items.forEach(([title, description]) => {
      const isCommand = title.startsWith('/');
      const row = document.createElement(isCommand ? 'button' : 'div');
      row.className = 'hu-row';
      if (!isCommand) row.style.cursor = 'default';
      row.innerHTML = `
        <span class="hu-row-title">${escapeHtml(title)}</span>
        <span class="hu-row-sub">${escapeHtml(description)}</span>
      `;
      if (isCommand) {
        row.addEventListener('click', () => {
          closeDrawer('hu-help-drawer');
          openPalette(title.replace(/^\//, '').split(' ')[0]);
        });
      }
      body.appendChild(row);
    });

    openDrawer(drawer);
  }

  function slaArcSvg(openedStr, dueStr, closedStr, slaState) {
    const r = 30, circ = 2 * Math.PI * r, arc = circ / 2, offset = -(circ / 4);
    let pct = 0, color = '#94a3b8', label = '--';
    const opened = openedStr ? new Date(openedStr).getTime() : 0;
    const due    = dueStr    ? new Date(dueStr).getTime()    : 0;
    if (opened && due) {
      const now = closedStr ? new Date(closedStr).getTime() : Date.now();
      pct   = Math.min(Math.max((now - opened) / (due - opened), 0), 1);
      label = slaState === 'O' ? 'Over' : slaState === 'E' ? 'Excl' : `${Math.round(pct * 100)}%`;
      color = slaState === 'O' ? '#ef4444' : slaState === 'E' ? '#94a3b8'
            : pct >= 1 ? '#ef4444' : pct >= 0.85 ? '#f59e0b' : '#10b981';
    } else if (slaState) {
      const sc = { I: '#10b981', O: '#ef4444', E: '#94a3b8' };
      color = sc[slaState] || '#94a3b8';
      label = { I: 'OK', O: 'Over', E: 'Excl' }[slaState] || '--';
      pct   = slaState === 'O' ? 1 : slaState === 'I' ? 0.5 : 0;
    }
    const fill = pct * arc;
    return `<svg width="80" height="54" viewBox="0 0 80 54" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
      <circle cx="40" cy="44" r="${r}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${arc} ${circ}" stroke-dashoffset="${offset}"/>
      <circle cx="40" cy="44" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${fill} ${circ}" stroke-dashoffset="${offset}"/>
      <text x="40" y="44" text-anchor="middle" dominant-baseline="middle" style="font-size:12px;font-weight:800;fill:#fff;font-family:-apple-system,sans-serif">${escapeHtml(label)}</text>
      <text x="40" y="57" text-anchor="middle" style="font-size:9px;fill:rgba(255,255,255,0.50);font-family:-apple-system,sans-serif">SLA</text>
    </svg>`;
  }

  function priorityDot(s) {
    const p = String(s || '').toLowerCase();
    if (/critical|urgent|p1/.test(p)) return '#ef4444';
    if (/high|p2/.test(p))            return '#f59e0b';
    if (/low|p4/.test(p))             return '#10b981';
    return '#3b82f6';
  }

  function classifyAction(outcome) {
    const o = String(outcome || '').toLowerCase();
    if (/email|mail|sent/.test(o))                          return { label: 'Email',         color: '#3b82f6' };
    if (/status|changed|closed|resolved|opened/.test(o))   return { label: 'Status change',  color: '#f59e0b' };
    if (/time|spent|logged/.test(o))                        return { label: 'Time entry',     color: '#8b5cf6' };
    return                                                         { label: 'Note',            color: '#10b981' };
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `${days}d ago`;
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(d);
  }

  async function openTicket360Panel() {
    const ticketId = getCurrentTicketId();
    if (!ticketId) {
      toast('Open a ticket first');
      return false;
    }

    injectStyles();
    closeDrawer('hu-ticket360-drawer');
    closeDrawer('hu-timeline-drawer');
    hideHaloMenu();
    if (HU.settings.hideHaloSidebar) hideHaloSidebars();

    HU.ticket360TicketId = ticketId;

    const PUSH_WIDTH = 520;
    const drawer = createDrawer('hu-ticket360-drawer', 'Ticket 360', removePushMode);
    if (HU.settings.drawer360Push) {
      Object.assign(drawer.style, {
        right: '0', top: '0', bottom: '0',
        borderRadius: '8px 0 0 8px',
        width: PUSH_WIDTH + 'px'
      });
      applyPushMode(PUSH_WIDTH);
    }
    const body = drawer.querySelector('.hu-drawer-body');
    body.style.padding = '0';
    body.innerHTML = `<div style="padding:14px"><div class="hu-row"><span class="hu-row-title">Loading dashboard...</span></div></div>`;
    openDrawer(drawer);
    document.getElementById('hu-360-inject-btn')?.classList.add('is-active');

    try {
      const [summaryPayload, actionsPayload, tracePayload] = await Promise.all([
        runHaloReport(buildTicket360Query(ticketId), 'HaloPlus Ticket 360'),
        runHaloReport(buildTicketActionTimelineQuery(ticketId), 'HaloPlus Ticket Timeline'),
        runHaloReport(buildTicketCommercialTraceQuery(ticketId), 'HaloPlus Ticket Commercial Trace')
      ]);

      const summaryError = getReportLoadError(summaryPayload);
      if (summaryError) {
        closeDrawer('hu-ticket360-drawer');
        return;
      }

      const summary = extractRows(summaryPayload)[0];
      const actions = extractRows(actionsPayload);
      const trace   = getReportLoadError(tracePayload) ? [] : sortTraceRows(extractRows(tracePayload));

      if (!summary) {
        closeDrawer('hu-ticket360-drawer');
        return;
      }

      body.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'padding:10px;display:flex;flex-direction:column;gap:0';

      const hero = document.createElement('div');
      hero.className = 'hu-card hu-ticket-hero';
      hero.style.marginBottom = '10px';
      hero.innerHTML = `
        <div class="hu-ticket-hero-main" style="flex:1;min-width:0">
          <div class="hu-ticket-id">Ticket #${escapeHtml(String(summary['Ticket ID']))}</div>
          <div class="hu-ticket-summary">${escapeHtml(summary['Summary'] || 'No summary')}</div>
          <div class="hu-chip-row">
            ${coloredChip(summary['Status'],      'status')}
            ${coloredChip(summary['Priority'],    'priority')}
            ${coloredChip(summary['Ticket Type'], 'type')}
          </div>
        </div>
        <div style="flex-shrink:0">
          ${slaArcSvg(summary['Opened'], summary['Due By'], summary['Closed'], summary['SLA State'])}
        </div>`;
      wrap.appendChild(hero);

      const kpiGrid = document.createElement('div');
      kpiGrid.className = 'hu-360-kpi-grid';
      const slaState = summary['SLA State'];
      const slaDot   = { I: '#10b981', O: '#ef4444', E: '#94a3b8' }[slaState] || '#94a3b8';
      [
        { label: 'Status',   value: summary['Status']      || '--', dot: summary['Closed'] ? '#6b7280' : '#3b82f6' },
        { label: 'Priority', value: summary['Priority']    || '--', dot: priorityDot(summary['Priority']) },
        { label: 'Type',     value: summary['Ticket Type'] || '--', dot: '#8b5cf6' },
        { label: 'SLA',      value: formatSlaState(slaState),       dot: slaDot }
      ].forEach(({ label, value, dot }) => {
        const card = document.createElement('div');
        card.className = 'hu-360-kpi';
        card.innerHTML = `<div class="hu-360-kpi-label">${escapeHtml(label)}</div>
          <div class="hu-360-kpi-value"><span class="hu-360-kpi-dot" style="background:${dot}"></span>${escapeHtml(value)}</div>`;
        kpiGrid.appendChild(card);
      });
      wrap.appendChild(kpiGrid);

      const oTime = summary['Opened'] ? new Date(summary['Opened']).getTime() : 0;
      const dTime = summary['Due By'] ? new Date(summary['Due By']).getTime() : 0;
      if (oTime && dTime) {
        const cTime   = summary['Closed'] ? new Date(summary['Closed']).getTime() : null;
        const now     = cTime || Date.now();
        const pct     = Math.min(Math.max((now - oTime) / (dTime - oTime), 0), 1);
        const pctPx   = Math.round(pct * 100);
        const barCol  = pct >= 1 ? '#ef4444' : pct >= 0.85 ? '#f59e0b' : '#10b981';
        const daysOpen = Math.floor((now - oTime) / 86400000);
        const daysLeft = Math.ceil((dTime - now) / 86400000);
        const note = cTime ? `Closed after ${daysOpen}d`
          : daysLeft > 0  ? `${daysLeft}d remaining`
          : `${Math.abs(daysLeft)}d overdue`;
        const timeCard = document.createElement('div');
        timeCard.className = 'hu-card';
        timeCard.style.marginBottom = '10px';
        timeCard.innerHTML = `
          <div class="hu-360-time-labels">
            <span>Opened ${escapeHtml(timeAgo(summary['Opened']))}</span>
            <span>Due ${escapeHtml(formatDateTime(summary['Due By']))}</span>
          </div>
          <div class="hu-360-time-track"><div class="hu-360-time-fill" style="width:${pctPx}%;background:${barCol}"></div></div>
          <div class="hu-360-time-note">${escapeHtml(note)}</div>`;
        wrap.appendChild(timeCard);
      }

      const peopleCard = document.createElement('div');
      peopleCard.className = 'hu-card';
      peopleCard.style.marginBottom = '10px';
      peopleCard.innerHTML = '<div class="hu-section-title">People &amp; ownership</div>';
      const peopleGrid = document.createElement('div');
      peopleGrid.className = 'hu-stat-grid';
      [
        statItem('End user',    summary['End User'],       summary['User Email'] || summary['User Mobile'] || ''),
        statItem('Assigned to', summary['Assigned Agent'], summary['Assigned Agent Email'] || ''),
        linkedItem('Client', summary['Client ID'], summary['Client'], summary['Client ID'] ? routeDetail('customer', summary['Client ID']) : ''),
        linkedItem('Site',   summary['Site ID'],   summary['Site'],   summary['Site ID']   ? routeDetail('site',     summary['Site ID'])   : '')
      ].filter(Boolean).forEach(n => peopleGrid.appendChild(n));
      peopleCard.appendChild(peopleGrid);
      wrap.appendChild(peopleCard);

      if (actions.length) {
        const actCounts = {};
        let totalMins = 0;
        actions.forEach(a => {
          const { label, color } = classifyAction(a['Outcome']);
          actCounts[label] = actCounts[label] || { count: 0, color };
          actCounts[label].count++;
          totalMins += Number(a['Time Taken']) || 0;
        });
        const maxCount = Math.max(...Object.values(actCounts).map(v => v.count));
        const actCard = document.createElement('div');
        actCard.className = 'hu-card';
        actCard.style.marginBottom = '10px';
        const actHd = document.createElement('div');
        actHd.className = 'hu-section-title-row';
        actHd.innerHTML = `<span class="hu-section-title" style="margin:0">Activity</span>${totalMins ? `<span style="font-size:11px;color:#667085;font-weight:400">${escapeHtml(formatMinutes(totalMins))} logged</span>` : ''}`;
        actCard.appendChild(actHd);
        Object.entries(actCounts).sort((a, b) => b[1].count - a[1].count).forEach(([label, { count, color }]) => {
          const row = document.createElement('div');
          row.className = 'hu-360-act-row';
          row.innerHTML = `<span class="hu-360-act-label">${escapeHtml(label)}</span>
            <div class="hu-360-act-track"><div class="hu-360-act-fill" style="width:${Math.round(count / maxCount * 100)}%;background:${color}"></div></div>
            <span class="hu-360-act-count">${count}</span>`;
          actCard.appendChild(row);
        });
        wrap.appendChild(actCard);
      }

      const tlCard = document.createElement('div');
      tlCard.className = 'hu-card';
      tlCard.style.marginBottom = '10px';
      const tlHd = document.createElement('div');
      tlHd.className = 'hu-section-title-row';
      tlHd.innerHTML = '<span class="hu-section-title" style="margin:0">Recent actions</span>';
      const tlBtn = document.createElement('button');
      tlBtn.className = 'hu-copy';
      tlBtn.style.cssText = 'font-size:10px;padding:2px 8px';
      tlBtn.textContent = 'Full timeline';
      tlBtn.addEventListener('click', () => openActionTimelinePanel(ticketId));
      tlHd.appendChild(tlBtn);
      tlCard.appendChild(tlHd);

      const tl = document.createElement('div');
      tl.className = 'hu-360-tl';
      const displayActions = actions.slice(0, 6);
      displayActions.forEach((action, i) => {
        const { color } = classifyAction(action['Outcome']);
        const isLast = i === displayActions.length - 1;
        const note = action['Note'] ? String(action['Note']) : '';
        const noteHtml = note
          ? `<div class="hu-360-tl-note">${escapeHtml(note.slice(0, 200))}${note.length > 200 ? '...' : ''}</div>` : '';
        const timePart = action['Time Taken'] ? ` - ${escapeHtml(formatMinutes(action['Time Taken']))}` : '';
        const row = document.createElement('div');
        row.className = 'hu-360-tl-row';
        row.innerHTML = `
          <div class="hu-360-tl-gutter">
            <div class="hu-360-tl-dot" style="background:${color}"></div>
            ${!isLast ? '<div class="hu-360-tl-line"></div>' : ''}
          </div>
          <div class="hu-360-tl-body">
            <div class="hu-360-tl-title">${escapeHtml(action['Outcome'] || `Action ${action['Action ID']}`)}</div>
            <div class="hu-360-tl-meta">${escapeHtml(action['Who'] || '--')} - ${escapeHtml(timeAgo(action['When']))}${timePart}</div>
            ${noteHtml}
          </div>`;
        tl.appendChild(row);
      });
      if (!actions.length) tl.innerHTML = '<div class="hu-empty-note">No actions returned.</div>';
      tlCard.appendChild(tl);
      wrap.appendChild(tlCard);

      if (trace.length) {
        const traceCard = document.createElement('div');
        traceCard.className = 'hu-card';
        traceCard.innerHTML = '<div class="hu-section-title">Commercial trace</div>';
        const traceList = document.createElement('div');
        traceList.className = 'hu-list';
        trace.forEach(row => traceList.appendChild(renderTraceRow(row)));
        traceCard.appendChild(traceList);
        wrap.appendChild(traceCard);
      }

      body.appendChild(wrap);
    } catch (error) {
      closeDrawer('hu-ticket360-drawer');
    }

    return true;
  }

  async function openActionTimelinePanel(ticketId = 0) {
    const resolvedTicketId = Number(ticketId) || getCurrentTicketId();
    if (!resolvedTicketId) {
      toast('Open a ticket first');
      return false;
    }

    injectStyles();
    closeDrawer('hu-timeline-drawer');

    HU.timelineTicketId = resolvedTicketId;
    const drawer = createDrawer('hu-timeline-drawer', 'Action timeline');
    const body = drawer.querySelector('.hu-drawer-body');
    body.innerHTML = '<div class="hu-row"><span class="hu-row-title">Loading ticket actions...</span></div>';
    openDrawer(drawer);

    try {
      const payload = await runHaloReport(buildTicketActionTimelineQuery(resolvedTicketId), 'HaloPlus Action Timeline');
      const loadError = getReportLoadError(payload);
      if (loadError) {
        body.innerHTML = `<div class="hu-row"><span class="hu-row-title">Action timeline query failed</span><span class="hu-row-sub">${escapeHtml(loadError)}</span></div>`;
        return;
      }
      const rows = extractRows(payload);
      body.innerHTML = '';

      const totalActions = rows.length;
      const emailActions = rows.filter(row => row['Date Emailed']).length;
      const hiddenActions = rows.filter(row => ['1', 'true', 'yes'].includes(String(row['Hidden']).toLowerCase())).length;
      const totalMinutes = rows.reduce((sum, row) => sum + (Number(row['Time Taken']) || 0), 0);
      const latestAction = rows[0];

      const header = document.createElement('section');
      header.className = 'hu-card hu-ticket-hero';
      header.innerHTML = `
        <div class="hu-ticket-hero-main">
          <div class="hu-ticket-id">Ticket #${resolvedTicketId}</div>
          <div class="hu-ticket-summary">Action timeline</div>
          <div class="hu-chip-row">
            ${coloredChip(totalActions ? `${totalActions} actions` : 'No actions', 'type')}
            ${coloredChip(emailActions ? `${emailActions} emails` : 'No emails', 'status')}
            ${coloredChip(hiddenActions ? `${hiddenActions} hidden` : 'All visible', hiddenActions ? 'priority' : 'status')}
          </div>
          <div class="hu-ticket-hero-sub" style="margin-top:8px;color:rgba(255,255,255,0.76);font-size:11px">
            ${escapeHtml(latestAction ? `Latest update ${timeAgo(latestAction['When'])}` : 'No updates returned yet')}
          </div>
        </div>
      `;
      body.appendChild(header);

      const kpiGrid = document.createElement('div');
      kpiGrid.className = 'hu-360-kpi-grid';
      [
        { label: 'Actions', value: totalActions ? String(totalActions) : '--', dot: '#3b82f6' },
        { label: 'Emails', value: emailActions ? String(emailActions) : '--', dot: '#10b981' },
        { label: 'Visible', value: totalActions ? String(totalActions - hiddenActions) : '--', dot: '#8b5cf6' },
        { label: 'Time logged', value: totalMinutes ? formatMinutes(totalMinutes) : '--', dot: '#f59e0b' }
      ].forEach(({ label, value, dot }) => {
        const card = document.createElement('div');
        card.className = 'hu-360-kpi';
        card.innerHTML = `<div class="hu-360-kpi-label">${escapeHtml(label)}</div>
          <div class="hu-360-kpi-value"><span class="hu-360-kpi-dot" style="background:${dot}"></span>${escapeHtml(value)}</div>`;
        kpiGrid.appendChild(card);
      });
      body.appendChild(kpiGrid);

      if (rows.length) {
        const actCounts = {};
        rows.forEach((row) => {
          const { label, color } = classifyAction(row['Outcome']);
          actCounts[label] = actCounts[label] || { count: 0, color };
          actCounts[label].count++;
        });
        const maxCount = Math.max(...Object.values(actCounts).map(v => v.count));
        const actCard = document.createElement('section');
        actCard.className = 'hu-card';
        actCard.style.marginBottom = '10px';
        actCard.innerHTML = '<div class="hu-section-title">Action mix</div>';
        Object.entries(actCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .forEach(([label, { count, color }]) => {
            const row = document.createElement('div');
            row.className = 'hu-360-act-row';
            row.innerHTML = `<span class="hu-360-act-label">${escapeHtml(label)}</span>
              <div class="hu-360-act-track"><div class="hu-360-act-fill" style="width:${Math.round(count / maxCount * 100)}%;background:${color}"></div></div>
              <span class="hu-360-act-count">${count}</span>`;
            actCard.appendChild(row);
          });
        body.appendChild(actCard);
      }

      const list = document.createElement('section');
      list.className = 'hu-card';
      const heading = document.createElement('div');
      heading.className = 'hu-section-title-row';
      heading.innerHTML = '<span class="hu-section-title" style="margin:0">Recent actions</span>';
      list.appendChild(heading);
      const listWrap = document.createElement('div');
      listWrap.className = 'hu-360-tl';
      rows.forEach((row, index) => listWrap.appendChild(renderActionTimelineFeedRow(row, index === rows.length - 1)));
      if (!rows.length) listWrap.innerHTML = '<div class="hu-empty-note">No actions returned for this ticket.</div>';
      list.appendChild(listWrap);
      body.appendChild(list);
    } catch (error) {
      body.innerHTML = `<div class="hu-row"><span class="hu-row-title">Could not load action timeline</span><span class="hu-row-sub">${escapeHtml(error.message)}</span></div>`;
    }

    return true;
  }

  function ticket360Section(title, items) {
    const section = document.createElement('section');
    section.className = 'hu-card';
    section.innerHTML = `<div class="hu-section-title">${escapeHtml(title)}</div>`;
    const grid = document.createElement('div');
    grid.className = 'hu-stat-grid';
    items.filter(Boolean).forEach(item => grid.appendChild(item));
    section.appendChild(grid);
    return section;
  }

  function statItem(label, value, sub = '') {
    const item = document.createElement('div');
    item.className = 'hu-stat';
    item.innerHTML = `
      <div class="hu-stat-label">${escapeHtml(label)}</div>
      <div class="hu-stat-value">${escapeHtml(value || '--')}</div>
      ${sub ? `<div class="hu-stat-sub">${escapeHtml(sub)}</div>` : ''}
    `;
    return item;
  }

  function linkedItem(label, id, title, path) {
    const item = statItem(label, title || (id ? `${label} ${id}` : '--'), id ? `ID ${id}` : '');
    if (path) {
      item.classList.add('hu-stat-link');
      item.title = `Open ${label}`;
      item.addEventListener('click', () => window.location.assign(new URL(path, window.location.origin).href));
    }
    return item;
  }

  function ticket360Chip(value, label) {
    if (!value) return '';
    return `<span class="hu-chip" title="${escapeHtml(label)}">${escapeHtml(value)}</span>`;
  }

  function coloredChip(value, kind) {
    if (!value) return '';
    const v = String(value).toLowerCase();
    let bg, border, text;

    if (kind === 'status') {
      if (/closed|resolved|completed|done|fixed/.test(v))
        [bg, border, text] = ['rgba(107,114,128,0.30)', 'rgba(156,163,175,0.45)', '#d1d5db'];
      else if (/progress|assigned|working|active|open/.test(v))
        [bg, border, text] = ['rgba(59,130,246,0.30)',  'rgba(147,197,253,0.45)', '#93c5fd'];
      else if (/wait|hold|pending|suspend|paused|defer/.test(v))
        [bg, border, text] = ['rgba(245,158,11,0.30)',  'rgba(252,211,77,0.45)',  '#fcd34d'];
      else if (/new|created/.test(v))
        [bg, border, text] = ['rgba(16,185,129,0.30)',  'rgba(110,231,183,0.45)', '#6ee7b7'];
      else
        [bg, border, text] = ['rgba(59,130,246,0.25)',  'rgba(147,197,253,0.35)', '#93c5fd'];

    } else if (kind === 'priority') {
      if (/critical|urgent|p1/.test(v))
        [bg, border, text] = ['rgba(239,68,68,0.30)',   'rgba(252,165,165,0.45)', '#fca5a5'];
      else if (/high|p2/.test(v))
        [bg, border, text] = ['rgba(249,115,22,0.30)',  'rgba(253,186,116,0.45)', '#fdba74'];
      else if (/low|p4|minor/.test(v))
        [bg, border, text] = ['rgba(16,185,129,0.30)',  'rgba(110,231,183,0.45)', '#6ee7b7'];
      else
        [bg, border, text] = ['rgba(59,130,246,0.25)',  'rgba(147,197,253,0.35)', '#93c5fd'];

    } else if (kind === 'type') {
      if (/major.?incident/.test(v))
        [bg, border, text] = ['rgba(220,38,38,0.35)',   'rgba(252,165,165,0.50)', '#fca5a5'];
      else if (/incident/.test(v))
        [bg, border, text] = ['rgba(239,68,68,0.25)',   'rgba(252,165,165,0.40)', '#fca5a5'];
      else if (/problem/.test(v))
        [bg, border, text] = ['rgba(249,115,22,0.25)',  'rgba(253,186,116,0.40)', '#fdba74'];
      else if (/change/.test(v))
        [bg, border, text] = ['rgba(59,130,246,0.25)',  'rgba(147,197,253,0.40)', '#93c5fd'];
      else if (/service.?request/.test(v))
        [bg, border, text] = ['rgba(16,185,129,0.25)',  'rgba(110,231,183,0.40)', '#6ee7b7'];
      else if (/task|project/.test(v))
        [bg, border, text] = ['rgba(139,92,246,0.25)',  'rgba(167,139,250,0.40)', '#c4b5fd'];
      else
        [bg, border, text] = ['rgba(255,155,81,0.25)',  'rgba(94,234,212,0.40)',  '#ffd2b2'];

    } else {
      [bg, border, text] = ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.18)', '#fff'];
    }

    return `<span class="hu-chip" style="background:${bg};border-color:${border};color:${text}">${escapeHtml(value)}</span>`;
  }

  function renderActionTimelineRow(action, expanded = false) {
    const isHidden = ['1', 'true', 'yes'].includes(String(action['Hidden']).toLowerCase());
    const row = document.createElement('div');
    row.className = 'hu-list-row';
    row.innerHTML = `
      <div class="hu-list-row-top">
        <span class="hu-list-title">${escapeHtml(action['Outcome'] || `Action ${action['Action ID']}`)}</span>
        <span class="hu-list-meta">${escapeHtml(formatDateTime(action['When']))}</span>
      </div>
      <div class="hu-list-row-sub">${escapeHtml(action['Who'] || 'Unknown')} - ${escapeHtml(isHidden ? 'Hidden from user' : 'Visible to user')} - ${escapeHtml(formatMinutes(action['Time Taken']))}</div>
      ${action['Date Emailed'] ? `<div class="hu-list-row-sub">Email sent ${escapeHtml(formatDateTime(action['Date Emailed']))}</div>` : ''}
      ${action['Note'] ? `<div class="hu-list-note">${escapeHtml(action['Note'])}</div>` : ''}
    `;
    return row;
  }

  function renderActionTimelineFeedRow(action, isLast = false) {
    const { label, color } = classifyAction(action['Outcome']);
    const isHidden = ['1', 'true', 'yes'].includes(String(action['Hidden']).toLowerCase());
    const note = action['Note'] ? String(action['Note']) : '';
    const noteHtml = note
      ? `<div class="hu-360-tl-note">${escapeHtml(note.slice(0, 320))}${note.length > 320 ? '...' : ''}</div>`
      : '';
    const emailHtml = action['Date Emailed']
      ? `<div class="hu-360-tl-note">Email sent ${escapeHtml(formatDateTime(action['Date Emailed']))}</div>`
      : '';
    const timePart = action['Time Taken'] ? ` - ${escapeHtml(formatMinutes(action['Time Taken']))}` : '';

    const row = document.createElement('div');
    row.className = 'hu-360-tl-row';
    row.innerHTML = `
      <div class="hu-360-tl-gutter">
        <div class="hu-360-tl-dot" style="background:${color}"></div>
        ${!isLast ? '<div class="hu-360-tl-line"></div>' : ''}
      </div>
      <div class="hu-360-tl-body">
        <div class="hu-360-tl-title">${escapeHtml(action['Outcome'] || `Action ${action['Action ID']}`)}</div>
        <div class="hu-360-tl-meta">${escapeHtml(action['Who'] || 'Unknown')} - ${escapeHtml(label)} - ${escapeHtml(timeAgo(action['When']))}${timePart}</div>
        <div class="hu-360-tl-meta">${escapeHtml(isHidden ? 'Hidden from user' : 'Visible to user')} - ${escapeHtml(formatDateTime(action['When']))}</div>
        ${noteHtml}
        ${emailHtml}
      </div>`;
    return row;
  }

  function renderTraceRow(row) {
    const wrapper = document.createElement('div');
    wrapper.className = 'hu-list-row';
    const recordType = String(row['Record Type'] || '');
    const recordId = row['Record ID'];
    const routeMap = {
      'Invoice': 'invoice',
      'Quote': 'quote',
      'Purchase Order': 'purchase'
    };
    const routeType = routeMap[recordType];
    wrapper.innerHTML = `
      <div class="hu-list-row-top">
        <span class="hu-list-title">${escapeHtml(recordType)} ${recordId ? `#${recordId}` : ''}</span>
        <span class="hu-list-meta">${escapeHtml(formatDateTime(row['Date']))}</span>
      </div>
      <div class="hu-list-row-sub">${escapeHtml(row['Title'] || '--')}${row['Reference'] ? ` - ${escapeHtml(row['Reference'])}` : ''}</div>
    `;
    if (routeType && recordId) {
      wrapper.classList.add('hu-list-row-link');
      wrapper.title = `Open ${recordType}`;
      wrapper.addEventListener('click', () => window.location.assign(new URL(routeDetail(routeType, recordId), window.location.origin).href));
    }
    return wrapper;
  }

  function toggleFieldOverlay() {
    HU.fieldOverlayOn = !HU.fieldOverlayOn;
    if (!HU.fieldOverlayOn) {
      clearTimeout(HU.overlayTimer);
      document.querySelectorAll('.hu-field-tag').forEach(tag => tag.remove());
      toast('Field API names hidden');
      return;
    }

    revealFieldNames();
    toast('Field API names shown');
  }

  function revealFieldNames() {
    if (!HU.fieldOverlayOn) return;
    document.querySelectorAll('.hu-field-tag').forEach(tag => tag.remove());
    const labels = document.querySelectorAll('label, .field-label, [class*="field-label"], [class*="form-label"]');

    labels.forEach(label => {
      if (isTableCheckboxLabel(label)) return;
      const apiName = getFieldApiName(label);
      if (!apiName) return;
      const tag = document.createElement('span');
      tag.className = 'hu-field-tag';
      tag.textContent = apiName;
      label.appendChild(tag);
    });

    revealTableColumnNames();
  }

  function isTableCheckboxLabel(label) {
    if (!label) return false;
    const hasCheckbox = Boolean(label.querySelector('input[type="checkbox"], [role="checkbox"]'));
    if (!hasCheckbox) return false;
    return Boolean(label.closest('.rt-thead, .rt-tbody, .rt-tr, .rt-tr-group, table, [role="grid"], [role="table"]'));
  }

  function revealTableColumnNames() {
    const headers = getTableColumnHeaders();

    headers.forEach(header => {
      if (header.closest('.hu-palette, .hu-drawer, .hu-toast')) return;
      if (header.querySelector('.hu-table-column-tag')) return;
      if (isSelectionColumnHeader(header)) return;

      const apiName = getTableColumnApiName(header);
      if (!apiName) return;
      if (isSelectionColumnName(apiName)) return;

      const tag = document.createElement('span');
      tag.className = 'hu-field-tag hu-table-column-tag';
      tag.textContent = apiName;
      const target = getTableHeaderLabelTarget(header);
      target.classList.add('hu-table-column-label-target');
      target.appendChild(tag);
    });
  }

  function getTableHeaderLabelTarget(header) {
    return header.querySelector('.hashoverbtn') ||
      [...header.querySelectorAll('.rt-resizable-header-content')]
        .find(node => normalizeHeaderLabel(node.textContent)) ||
      header;
  }

  function getTableColumnHeaders() {
    const headers = new Set(document.querySelectorAll('th, [role="columnheader"], .rt-thead .rt-th'));
    document.querySelectorAll('[class]').forEach(element => {
      if (element.closest('.rt-thead .rt-th') && !element.classList?.contains('rt-th')) return;
      const className = String(element.className || '').toLowerCase();
      if (className.includes('columnheader') ||
          className.includes('column-header') ||
          className.includes('headercell') ||
          className.includes('header-cell') ||
          className.includes('ag-header-cell') ||
          className.includes('table-header')) {
        headers.add(element);
      }
    });
    return [...headers];
  }

  function getTableColumnApiName(header) {
    const candidates = [header];
    candidates.push(...header.querySelectorAll([
      '[name]',
      '[id]',
      '[data-field]',
      '[data-field-name]',
      '[data-fieldname]',
      '[data-column]',
      '[data-column-id]',
      '[data-columnid]',
      '[data-column-name]',
      '[data-name]',
      '[data-col]',
      '[data-key]',
      '[data-property]',
      '[data-sort]',
      '[data-sort-key]',
      '[data-accessor]',
      '[col-id]',
      '[field]',
      '[aria-label]'
    ].join(',')));

    for (const element of candidates) {
      const value = element?.getAttribute?.('data-field') ||
        element?.getAttribute?.('data-field-name') ||
        element?.getAttribute?.('data-fieldname') ||
        element?.getAttribute?.('data-column') ||
        element?.getAttribute?.('data-column-id') ||
        element?.getAttribute?.('data-columnid') ||
        element?.getAttribute?.('data-column-name') ||
        element?.getAttribute?.('data-name') ||
        element?.getAttribute?.('data-col') ||
        element?.getAttribute?.('data-key') ||
        element?.getAttribute?.('data-property') ||
        element?.getAttribute?.('data-sort') ||
        element?.getAttribute?.('data-sort-key') ||
        element?.getAttribute?.('data-accessor') ||
        element?.getAttribute?.('col-id') ||
        element?.getAttribute?.('field') ||
        element?.getAttribute?.('name') ||
        element?.getAttribute?.('id') ||
        element?.getAttribute?.('aria-label');
      const cleaned = cleanFieldName(value);
      if (cleaned && !isGeneratedDomId(cleaned) && !isSelectionColumnName(cleaned)) return cleaned;
    }

    return getKnownTableColumnName(header);
  }

  function getKnownTableColumnName(header) {
    const label = getTableHeaderLabel(header);
    if (!label) return '';

    const ticketColumns = {
      id: 'Faultid',
      agent: 'AssignedToInt',
      summary: 'Symptom',
      'change type': 'RequestTypeNew',
      'ticket type': 'RequestTypeNew',
      type: 'RequestTypeNew',
      status: 'Status',
      'asset tag': 'DInvNo',
      asset: 'DeviceNumber',
      'related services': 'FServiceid',
      service: 'FServiceid',
      'start date time': 'DateOccured',
      'start date': 'DateOccured',
      opened: 'DateOccured',
      'end date time': 'DateCleared',
      'end date': 'DateCleared',
      closed: 'DateCleared',
      priority: 'Seriousness',
      client: 'Areaint',
      customer: 'Areaint',
      site: 'SiteNumber',
      team: 'Sectio_',
      category: 'Category2'
    };

    return ticketColumns[label] || '';
  }

  function getTableHeaderLabel(header) {
    const target = header.querySelector('.hashoverbtn') ||
      header.querySelector('.rt-resizable-header-content') ||
      header;
    const clone = target.cloneNode(true);
    clone.querySelectorAll('button, svg, i, .hu-field-tag, .rt-resizer, input, label').forEach(node => node.remove());
    return normalizeHeaderLabel(clone.textContent);
  }

  function normalizeHeaderLabel(value) {
    return String(value || '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isSelectionColumnHeader(header) {
    if (!header) return false;
    const text = (header.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const checkbox = header.querySelector('input[type="checkbox"], [role="checkbox"]');
    const headerLabel = getTableHeaderLabel(header);
    if (checkbox && (!headerLabel || /^(select|select all|selection|checkbox|bulk select|bulk select all)$/.test(headerLabel))) return true;

    const attrs = [
      header.getAttribute('aria-label'),
      header.getAttribute('title'),
      header.getAttribute('data-field'),
      header.getAttribute('data-field-name'),
      header.getAttribute('data-fieldname'),
      header.getAttribute('data-column'),
      header.getAttribute('data-column-id'),
      header.getAttribute('data-columnid'),
      header.getAttribute('data-column-name'),
      header.getAttribute('data-name'),
      header.getAttribute('data-col'),
      header.getAttribute('data-key'),
      header.getAttribute('data-property'),
      header.getAttribute('data-sort'),
      header.getAttribute('data-sort-key'),
      header.getAttribute('col-id'),
      header.getAttribute('field'),
      header.getAttribute('class')
    ].join(' ').toLowerCase();

    return /(^|[\s_-])(select|selection|checkbox|check-box|bulk|rowselect|row-select)([\s_-]|$)/.test(attrs) &&
      (!text || /^(select|select all|selection|checkbox)$/.test(text));
  }

  function isSelectionColumnName(value) {
    const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return /^(bulk_)?select(_all)?$/.test(normalized) ||
      /^(bulk|selection|checkbox|check_box|row_select|rowselect|select_checkbox|checkbox_select)$/.test(normalized) ||
      normalized.includes('bulk_select') ||
      normalized.includes('row_select');
  }

  function getFieldApiName(label) {
    const forId = label.getAttribute('for');
    const candidates = [];

    if (forId) candidates.push(document.getElementById(forId));
    const parent = label.closest('div, li, tr, section') || label.parentElement;
    if (parent) candidates.push(...parent.querySelectorAll('input, textarea, select, [name], [data-field], [data-fieldname], [data-column], [data-name]'));

    for (const element of candidates) {
      const value = element?.getAttribute?.('name') ||
        element?.getAttribute?.('id') ||
        element?.getAttribute?.('data-field') ||
        element?.getAttribute?.('data-fieldname') ||
        element?.getAttribute?.('data-column') ||
        element?.getAttribute?.('data-name') ||
        element?.getAttribute?.('aria-label');
      const cleaned = cleanFieldName(value);
      if (cleaned) return cleaned;
    }

    return label.textContent ? label.textContent.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() : '';
  }

  function cleanFieldName(value) {
    if (!value) return '';
    const cleaned = String(value).trim().replace(/^react-select-\d+-/, '').replace(/[^a-zA-Z0-9_.-]+/g, '_');
    if (!cleaned || cleaned.length > 80) return '';
    return cleaned;
  }

  function isGeneratedDomId(value) {
    return /^(react-select|mui-|radix-|headlessui-|rc_|:r|cell-|row-|grid-)/i.test(value);
  }

  async function openJsonInspector() {
    injectStyles();
    closeDrawer('hu-recent-drawer');
    closeDrawer('hu-json-drawer');

    const drawer = createDrawer('hu-json-drawer', 'Record JSON inspector');
    const body = drawer.querySelector('.hu-drawer-body');
    body.innerHTML = '<div class="hu-row"><span class="hu-row-title">Loading current record...</span></div>';
    openDrawer(drawer);

    try {
      const record = detectCurrentRecordQuery();
      if (!record) {
        body.innerHTML = '<div class="hu-row"><span class="hu-row-title">No supported record detected</span><span class="hu-row-sub">Open a ticket, customer, user, agent, or asset record and run this command again.</span></div>';
        return;
      }

      const payload = await runHaloReport(record.sql, `HaloPlus ${record.type} Inspector`);
      const row = extractRows(payload)[0];
      if (!row) {
        body.innerHTML = '<div class="hu-row"><span class="hu-row-title">No payload returned</span><span class="hu-row-sub">Halo accepted the query, but did not return a record row.</span></div>';
        return;
      }

      body.innerHTML = '';
      const jsonText = JSON.stringify(row, null, 2);

      const toolbar = document.createElement('div');
      toolbar.className = 'hu-toolbar-row';
      toolbar.innerHTML = `
        <div>
          <span class="hu-row-title">${escapeHtml(record.type)} ${escapeHtml(record.id)}</span>
          <span class="hu-row-sub">${escapeHtml(record.sql)}</span>
        </div>
        <button class="hu-copy hu-copy-json" title="Copy JSON to clipboard">Copy JSON</button>
      `;
      body.appendChild(toolbar);

      const copyBtn = toolbar.querySelector('.hu-copy-json');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(jsonText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 2000);
        });
      });

      const pre = document.createElement('pre');
      pre.className = 'hu-json-formatted';
      pre.textContent = jsonText;
      body.appendChild(pre);
    } catch (error) {
      body.innerHTML = `<div class="hu-row"><span class="hu-row-title">Could not load JSON</span><span class="hu-row-sub">${escapeHtml(error.message)}</span></div>`;
    }
  }

  function detectCurrentRecordQuery() {
    const url = new URL(window.location.href);
    const text = url.href.toLowerCase();
    const id = url.searchParams.get('id') || url.searchParams.get('faultid') || url.searchParams.get('selid');
    if (!id) return null;

    const safeId = Number(id);
    if (!Number.isFinite(safeId)) return null;

    if (text.includes('/ticket') || text.includes('/fault')) {
      return { type: 'Ticket', id, sql: `SELECT TOP 1 * FROM faults WHERE Faultid = ${safeId}` };
    }
    if (text.includes('/customer') || text.includes('/area') || text.includes('/client')) {
      return { type: 'Customer', id, sql: `SELECT TOP 1 * FROM area WHERE AArea = ${safeId}` };
    }
    if (text.includes('/agent') || text.includes('/uname')) {
      return { type: 'Agent', id, sql: `SELECT TOP 1 * FROM uname WHERE UNum = ${safeId}` };
    }
    if (text.includes('/user')) {
      return { type: 'User', id, sql: `SELECT TOP 1 * FROM users WHERE uid = ${safeId}` };
    }
    if (text.includes('/asset') || text.includes('/device')) {
      return { type: 'Asset', id, sql: `SELECT TOP 1 * FROM device WHERE DID = ${safeId}` };
    }

    return null;
  }

  function renderJsonLines(object) {
    return Object.entries(flattenObject(object)).map(([path, value]) => {
      const line = document.createElement('div');
      line.className = 'hu-json-line';
      line.innerHTML = `
        <span><span class="hu-json-path">${escapeHtml(path)}</span>: <span class="hu-json-value">${escapeHtml(formatValue(value))}</span></span>
        <button class="hu-copy" title="Copy path and value">Copy</button>
      `;
      line.querySelector('.hu-copy').addEventListener('click', () => copyText(`${path}: ${formatValue(value)}`));
      return line;
    });
  }

  function flattenObject(value, prefix = '', out = {}) {
    if (value === null || typeof value !== 'object') {
      out[prefix || 'value'] = value;
      return out;
    }

    Object.entries(value).forEach(([key, child]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) flattenObject(child, next, out);
      else out[next] = child;
    });
    return out;
  }

  function getPushTarget() {
    return document.querySelector(
      '#maincontent, .maincontent, #MainContent, .MainContent, ' +
      '#main-content, .main-content, #main_content, ' +
      '[id*="maincontent"], app-root'
    ) || document.body;
  }

  function applyPushMode(width) {
    const el = getPushTarget();
    el.dataset.huPushOrig = JSON.stringify({
      width: el.style.width || '',
      maxWidth: el.style.maxWidth || '',
      transition: el.style.transition || ''
    });
    el.style.transition = 'width 0.3s, max-width 0.3s';
    el.style.width = `calc(100% - ${width}px)`;
    el.style.maxWidth = `calc(100% - ${width}px)`;
  }

  function removePushMode() {
    const el = getPushTarget();
    if (!el.dataset.huPushOrig) return;
    try {
      const orig = JSON.parse(el.dataset.huPushOrig);
      el.style.width = orig.width;
      el.style.maxWidth = orig.maxWidth;
      el.style.transition = orig.transition;
    } catch (e) { /* ignore */ }
    delete el.dataset.huPushOrig;
  }

  function createDrawer(id, title, onClose) {
    const drawer = document.createElement('div');
    drawer.className = 'hu-drawer';
    drawer.id = id;
    drawer.style.transform = 'translateX(calc(100% + 40px))';
    drawer.innerHTML = `
      <div class="hu-drawer-header">
        <span class="hu-drawer-title">${escapeHtml(title)}</span>
        <button class="hu-icon-btn" title="Close">x</button>
      </div>
      <div class="hu-drawer-body"></div>
    `;
    drawer.querySelector('.hu-icon-btn').addEventListener('click', () => {
      closeDrawer(id);
      if (onClose) onClose();
    });
    return drawer;
  }

  function openDrawer(drawer) {
    document.body.appendChild(drawer);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      drawer.style.transform = '';
    }));
  }

  function hideHaloMenu() {
    const btn = document.querySelector('button.fabtn[title="Hide Menu"]');
    if (btn) { HU._hidHaloMenu = true; btn.click(); }
  }

  function showHaloMenu() {
    if (!HU._hidHaloMenu) return;
    HU._hidHaloMenu = false;
    const btn = document.querySelector('button.fabtn[title="Show Menu"]');
    if (btn) btn.click();
  }

  function hideHaloSidebars() {
    const containers = document.querySelectorAll('.hassidebar.sidebar-2s');
    const sidebars   = document.querySelectorAll('.details-sidebar');
    if (!containers.length && !sidebars.length) return false;
    HU._hiddenSidebarEls = [];
    containers.forEach(el => {
      HU._hiddenSidebarEls.push({ el, type: 'container' });
      el.classList.remove('hassidebar', 'sidebar-2s');
    });
    sidebars.forEach(el => {
      HU._hiddenSidebarEls.push({ el, type: 'sidebar', origDisplay: el.style.display });
      el.style.display = 'none';
    });
    return true;
  }

  function hideHaloSidebarsWithRetry() {
    hideHaloSidebars();
  }

  function showHaloSidebars() {
    if (!HU._hiddenSidebarEls?.length) return;
    HU._hiddenSidebarEls.forEach(({ el, type, origDisplay }) => {
      if (type === 'container') {
        el.classList.add('hassidebar', 'sidebar-2s');
      } else {
        el.style.display = origDisplay || '';
      }
    });
    HU._hiddenSidebarEls = null;
  }

  function closeDrawer(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'hu-ticket360-drawer') {
      removePushMode();
      showHaloMenu();
      showHaloSidebars();
      document.getElementById('hu-360-inject-btn')?.classList.remove('is-active');
    }
    el.style.transform = 'translateX(calc(100% + 40px))';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }

  function toast(message) {
    injectStyles();
    const existing = document.getElementById('hu-toast');
    existing?.remove();
    const root = document.body || document.documentElement;
    if (!root) return;
    const el = document.createElement('div');
    el.id = 'hu-toast';
    el.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:2147483602;background:#172033;color:#fff;padding:8px 12px;border-radius:7px;font:12px -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.25)';
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      if (el.isConnected) el.remove();
    }, 1800);
  }

  function cleanTitle(title) {
    return String(title || '').replace(/\s*[-|]\s*Halo.*$/i, '').trim();
  }

  function formatValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function copyText(value) {
    navigator.clipboard?.writeText(value).then(() => toast('Copied'));
  }

  function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(value) {
    return new Promise(resolve => chrome.storage.local.set(value, resolve));
  }

  function sendContext() {
    chrome.runtime.sendMessage({
      type: 'HALO_CONTEXT',
      data: detectContext()
    });
  }


  const HU_CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  function huCrc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = HU_CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function huZipFiles(files) {
    const enc = new TextEncoder();
    const entries = [];
    let localOffset = 0;
    for (const [name, content] of files) {
      const nameBytes = enc.encode(name);
      const dataBytes = enc.encode(content);
      entries.push({ nameBytes, dataBytes, crc: huCrc32(dataBytes), offset: localOffset });
      localOffset += 30 + nameBytes.length + dataBytes.length;
    }
    const cdOffset = localOffset;
    const cdSize = entries.reduce((s, e) => s + 46 + e.nameBytes.length, 0);
    const buf = new Uint8Array(cdOffset + cdSize + 22);
    let p = 0;
    const w16 = v => { buf[p]=v&255; buf[p+1]=(v>>8)&255; p+=2; };
    const w32 = v => { buf[p]=v&255; buf[p+1]=(v>>8)&255; buf[p+2]=(v>>16)&255; buf[p+3]=(v>>24)&255; p+=4; };
    const wb  = a => { buf.set(a, p); p+=a.length; };
    for (const { nameBytes: n, dataBytes: d, crc } of entries) {
      w32(0x04034b50); w16(20); w16(0); w16(0); w16(0); w16(0);
      w32(crc); w32(d.length); w32(d.length); w16(n.length); w16(0);
      wb(n); wb(d);
    }
    for (const { nameBytes: n, dataBytes: d, crc, offset } of entries) {
      w32(0x02014b50); w16(20); w16(20); w16(0); w16(0); w16(0); w16(0);
      w32(crc); w32(d.length); w32(d.length);
      w16(n.length); w16(0); w16(0); w16(0); w16(0); w32(0); w32(offset);
      wb(n);
    }
    w32(0x06054b50); w16(0); w16(0); w16(entries.length); w16(entries.length);
    w32(cdSize); w32(cdOffset); w16(0);
    return buf;
  }

  function huXlsxColRef(n) {
    let s = '';
    for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
    return s;
  }

  function huXlsxEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function tableDataToXlsx(headers, rows) {
    let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`;
    sheetXml += '<row r="1">' + headers.map((h, ci) =>
      `<c r="${huXlsxColRef(ci)}1" t="inlineStr"><is><t>${huXlsxEsc(h)}</t></is></c>`
    ).join('') + '</row>';
    rows.forEach((row, ri) => {
      const rowNum = ri + 2;
      sheetXml += `<row r="${rowNum}">` + row.map((val, ci) => {
        const ref = `${huXlsxColRef(ci)}${rowNum}`;
        const num = Number(val);
        if (val !== '' && !isNaN(num) && isFinite(num)) return `<c r="${ref}"><v>${num}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t>${huXlsxEsc(val)}</t></is></c>`;
      }).join('') + '</row>';
    });
    sheetXml += '</sheetData></worksheet>';
    return huZipFiles([
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ['xl/worksheets/sheet1.xml', sheetXml],
    ]);
  }

  function tableDataToCSV(headers, rows) {
    const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    return [headers.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\r\n');
  }

  function tableDataToJSON(headers, rows) {
    return JSON.stringify(rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))), null, 2);
  }

  function huDownloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportData(headers, rows, format, sourceName = 'halo-export') {
    if (!headers.length || !rows.length) return;
    const slug = (document.title || 'halo-export')
      .replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
    const filename = slug || sourceName;
    if (format === 'xlsx') {
      huDownloadBlob(new Blob([tableDataToXlsx(headers, rows)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
    } else if (format === 'csv') {
      huDownloadBlob(new Blob([tableDataToCSV(headers, rows)], { type: 'text/csv' }), `${filename}.csv`);
    } else if (format === 'json') {
      huDownloadBlob(new Blob([tableDataToJSON(headers, rows)], { type: 'application/json' }), `${filename}.json`);
    }
  }

  function exportTable(table, format) {
    const data = extractTableData(table, { displayedOnly: true });
    exportData(data.headers, data.rows, format);
  }

  function attachExportButton(target, getData) {
    if (target.dataset.huExport) return;
    target.dataset.huExport = '1';
    const bar = document.createElement('div');
    bar.className = 'hu-tbl-export-bar';
    bar.innerHTML = `
      <div class="hu-tbl-export-wrap">
        <div role="listbox" aria-expanded="false" class="ui button dropdown hu-tbl-export-dropdown" tabindex="0">
          <button type="button" class="${getExportButtonClass()}" title="Export" aria-label="Export" style="background-color: rgb(255, 155, 81) !important; color: white !important;">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <path d="M7 10l5 5 5-5"></path>
              <path d="M12 15V3"></path>
            </svg>
          </button>
          <div class="right menu transition right hu-tbl-export-menu hu-hidden">
            <div class="item hu-tbl-export-item" data-fmt="xlsx" role="option">
              <svg viewBox="0 0 384 512" aria-hidden="true"><path d="M369.9 97.9L286 14C277 5 264.8-.1 252.1-.1H48C21.5 0 0 21.5 0 48v416c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48V131.9c0-12.7-5.1-25-14.1-34zM347.3 120.6c2.1 2.1 3.5 4.6 4.2 7.4H256V32.5c2.8.7 5.3 2.1 7.4 4.2l83.9 83.9zM336 480H48c-8.8 0-16-7.2-16-16V48c0-8.8 7.2-16 16-16h176v104c0 13.3 10.7 24 24 24h104v304c0 8.8-7.2 16-16 16zM211.7 308l50.5-81.8c4.8-8-.9-18.2-10.3-18.2h-4.1c-4.1 0-7.9 2.1-10.1 5.5-31 48.5-36.4 53.5-45.7 74.5-17.2-32.2-8.4-16-45.8-74.5-2.2-3.4-6-5.5-10.1-5.5H132c-9.4 0-15.1 10.3-10.2 18.2L173 308l-59.1 89.5c-5.1 8 .6 18.5 10.1 18.5h3.5c4.1 0 7.9-2.1 10.1-5.5 37.2-58 45.3-62.5 54.4-82.5 31.5 56.7 44.3 67.2 54.4 82.6 2.2 3.4 6 5.4 10 5.4h3.6c9.5 0 15.2-10.4 10.1-18.4L211.7 308z"/></svg>
              <span>Export to Excel</span>
            </div>
            <div class="item hu-tbl-export-item" data-fmt="csv" role="option">
              <svg viewBox="0 0 384 512" aria-hidden="true"><path d="M369.9 97.9L286 14C277 5 264.8-.1 252.1-.1H48C21.5 0 0 21.5 0 48v416c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48V131.9c0-12.7-5.1-25-14.1-34zM347.3 120.6c2.1 2.1 3.5 4.6 4.2 7.4H256V32.5c2.8.7 5.3 2.1 7.4 4.2l83.9 83.9zM336 480H48c-8.8 0-16-7.2-16-16V48c0-8.8 7.2-16 16-16h176v104c0 13.3 10.7 24 24 24h104v304c0 8.8-7.2 16-16 16zM211.7 308l50.5-81.8c4.8-8-.9-18.2-10.3-18.2h-4.1c-4.1 0-7.9 2.1-10.1 5.5-31 48.5-36.4 53.5-45.7 74.5-17.2-32.2-8.4-16-45.8-74.5-2.2-3.4-6-5.5-10.1-5.5H132c-9.4 0-15.1 10.3-10.2 18.2L173 308l-59.1 89.5c-5.1 8 .6 18.5 10.1 18.5h3.5c4.1 0 7.9-2.1 10.1-5.5 37.2-58 45.3-62.5 54.4-82.5 31.5 56.7 44.3 67.2 54.4 82.6 2.2 3.4 6 5.4 10 5.4h3.6c9.5 0 15.2-10.4 10.1-18.4L211.7 308z"/></svg>
              <span>Export to CSV</span>
            </div>
            <div class="item hu-tbl-export-item" data-fmt="json" role="option">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3M9.5 8.5 7 12l2.5 3.5M14.5 8.5 17 12l-2.5 3.5M13 7l-2 10" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>Export to JSON</span>
            </div>
          </div>
        </div>
      </div>`;
    const dropdown = bar.querySelector('.hu-tbl-export-dropdown');
    const btn = bar.querySelector('.hu-tbl-export-btn');
    const menu = bar.querySelector('.hu-tbl-export-menu');
    const setOpen = isOpen => {
      dropdown.classList.toggle('active', isOpen);
      dropdown.classList.toggle('visible', isOpen);
      dropdown.setAttribute('aria-expanded', String(isOpen));
      menu.classList.toggle('hu-hidden', !isOpen);
      menu.classList.toggle('visible', isOpen);
      if (isOpen) alignExportMenu(menu);
    };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      closeExportMenus();
      setOpen(menu.classList.contains('hu-hidden'));
    });
    bar.querySelectorAll('.hu-tbl-export-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        setOpen(false);
        const data = getData({ displayedOnly: true });
        exportData(data.headers, data.rows, item.dataset.fmt);
      });
    });
    const anchor = findExportButtonAnchor(target);
    if (anchor?.parentElement) {
      bar.classList.add('hu-tbl-export-inline');
      anchor.insertAdjacentElement('afterend', bar);
    } else {
      target.parentNode.insertBefore(bar, target);
    }
    return;
  }

  function attachTableExport(table) {
    attachExportButton(table, options => extractTableData(table, options));
  }

  function attachGridExport(grid) {
    attachExportButton(grid, options => extractGridData(grid, options));
  }

  function getExportButtonClass() {
    return 'solidbutton hu-tbl-export-btn fabtn nhd-button curve glow-btn oneline headerGlowBtn';
  }

  function closeExportMenus() {
    document.querySelectorAll('.hu-tbl-export-dropdown').forEach(dropdown => {
      dropdown.classList.remove('active', 'visible');
      dropdown.setAttribute('aria-expanded', 'false');
      const menu = dropdown.querySelector('.hu-tbl-export-menu');
      if (menu) {
        menu.classList.add('hu-hidden');
        menu.classList.remove('visible');
      }
    });
  }

  function alignExportMenu(menu) {
    menu.classList.remove('hu-align-left', 'hu-align-right');
    menu.style.maxWidth = `${Math.max(160, window.innerWidth - 24)}px`;

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        menu.classList.add('hu-align-right');
      } else if (rect.left < 8) {
        menu.classList.add('hu-align-left');
      }
    });
  }

  function cleanCellText(node) {
    return String(node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function visibleNodes(nodes, options = {}) {
    if (options.displayedOnly === false) return [...nodes];
    return [...nodes].filter(node => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
  }

  function findExportButtonAnchor(target) {
    const candidates = [];
    let scope = target.parentElement;
    for (let depth = 0; scope && depth < 7; depth += 1, scope = scope.parentElement) {
      const buttons = visibleNodes(scope.querySelectorAll('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]'))
        .filter(isLikelyNewButton)
        .filter(button => !button.closest('.hu-tbl-export-bar, .hu-drawer, .hu-palette'));
      buttons.forEach(button => {
        const container = button.closest('.ui.button.dropdown, .buttons-container, .button-container') || button;
        candidates.push({ button: container, depth });
      });
      if (buttons.length) break;
    }

    return candidates.sort((a, b) => a.depth - b.depth)[0]?.button || null;
  }

  function isLikelyNewButton(button) {
    const label = [
      cleanCellText(button),
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.value
    ].filter(Boolean).join(' ').toLowerCase();

    return /(^|\s|\+)(new|add|create)(\s|$)/i.test(label) ||
      /\bnieuw\b/i.test(label) ||
      /\btoevoegen\b/i.test(label);
  }

  function extractTableData(table, options = {}) {
    let headers = visibleNodes(table.querySelectorAll('thead th, thead td'), options).map(cleanCellText).filter(Boolean);
    let bodyRows = visibleNodes(table.querySelectorAll('tbody tr'), options);

    if (!headers.length) {
      const firstHeaderRow = table.querySelector('tr:has(th), tr');
      const headerCells = firstHeaderRow ? visibleNodes(firstHeaderRow.querySelectorAll('th, td'), options) : [];
      headers = headerCells.map(cleanCellText).filter(Boolean);
      bodyRows = visibleNodes(table.querySelectorAll('tr'), options).filter(row => row !== firstHeaderRow);
    }

    const rows = bodyRows
      .map(row => visibleNodes(row.querySelectorAll('td, th'), options).map(cleanCellText))
      .filter(row => row.length >= 2 && row.some(Boolean));
    return normalizeExportData(headers, rows);
  }

  function extractGridData(grid, options = {}) {
    const headerSelectors = [
      '[role="columnheader"]',
      '.ag-header-cell-text',
      '.ReactVirtualized__Table__headerColumn',
      '.rt-th',
      '[class*="headercell" i]',
      '[class*="columnheader" i]'
    ].join(',');
    const cellSelectors = [
      '[role="gridcell"]',
      '[role="cell"]',
      '.ag-cell',
      '.ReactVirtualized__Table__rowColumn',
      '.rt-td',
      '[class*="gridcell" i]',
      '[class*="cell" i]'
    ].join(',');

    const headerNodes = visibleNodes(grid.querySelectorAll(headerSelectors), options);
    let headers = headerNodes.map(cleanCellText);
    const rows = visibleNodes(grid.querySelectorAll('[role="row"], .ag-row, .ReactVirtualized__Table__row, .rt-tr-group'), options)
      .filter(row => !row.querySelector('[role="columnheader"]'))
      .map(row => {
        const cells = visibleNodes(row.querySelectorAll(cellSelectors), options).map(cleanCellText);
        const rowId = getGridRowId(row);
        if (shouldInjectGridRowId(headers, cells, rowId)) {
          cells[0] = rowId;
          if (!headers[0]) headers[0] = 'ID';
        }
        return cells;
      })
      .filter(row => row.length >= 2 && row.some(Boolean));

    headers = headers.filter((header, index) => header || rows.some(row => row[index]));
    return normalizeExportData(headers, rows);
  }

  function getGridRowId(row) {
    const raw = row.getAttribute('data-id') ||
      row.getAttribute('data-row-id') ||
      row.getAttribute('row-id') ||
      row.id ||
      '';
    return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
  }

  function shouldInjectGridRowId(headers, cells, rowId) {
    if (!rowId || !cells.length || cells[0]) return false;
    const cleanHeaders = headers.map(header => String(header || '').trim());
    const hasLeadingUtilityColumn = !cleanHeaders[0];
    const hasIdHeader = cleanHeaders.some(header => /\bid\b/i.test(header));
    const rowAlreadyContainsId = cells.some(cell => String(cell || '').trim() === rowId);
    return !hasLeadingUtilityColumn && !hasIdHeader && !rowAlreadyContainsId;
  }

  function normalizeExportData(headers, rows) {
    let cleanHeaders = headers.map(header => String(header || '').trim());
    let cleanRows = rows.map(row => row.map(value => String(value || '').trim()));

    while (
      cleanHeaders.length > 0 &&
      cleanRows.length > 0 &&
      cleanRows.some(row => row.length > cleanHeaders.length) &&
      cleanRows.every(row => !row[0])
    ) {
      cleanRows = cleanRows.map(row => row.slice(1));
    }

    let width = Math.max(cleanHeaders.length, ...cleanRows.map(row => row.length), 0);
    for (let index = width - 1; index >= 0; index -= 1) {
      const headerBlank = !cleanHeaders[index];
      const rowsBlank = cleanRows.every(row => !row[index]);
      if (headerBlank && rowsBlank) {
        cleanHeaders.splice(index, 1);
        cleanRows = cleanRows.map(row => {
          const next = row.slice();
          next.splice(index, 1);
          return next;
        });
      }
    }

    width = Math.max(cleanHeaders.length, ...cleanRows.map(row => row.length), 0);
    if (width < 2) return { headers: [], rows: [] };
    const normalizedHeaders = Array.from({ length: width }, (_, index) => cleanHeaders[index] || `Column ${index + 1}`);
    const normalizedRows = cleanRows.map(row => Array.from({ length: width }, (_, index) => row[index] || ''));
    return { headers: normalizedHeaders, rows: normalizedRows };
  }

  function scanForTables() {
    // Halo has its own built-in export, so HaloPlus no longer injects table export UI.
  }

  function injectTicket360Button() {
    if (!getCurrentTicketId()) return;
    if (document.getElementById('hu-360-inject-btn')) return;
    const container = document.querySelector('.buttons-container:has(button[title="Share"])');
    if (!container) return;
    const btn = document.createElement('button');
    btn.id = 'hu-360-inject-btn';
    btn.className = 'solidbutton fabtn notext hu-360-inject-btn';
    btn.type = 'button';
    btn.title = 'Toggle Ticket 360 dashboard';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="white" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2" width="14" height="12" rx="1.5"/><line x1="10" y1="2" x2="10" y2="14"/><line x1="1" y1="6.5" x2="10" y2="6.5"/><line x1="1" y1="10.5" x2="10" y2="10.5"/></svg>`;
    if (document.getElementById('hu-ticket360-drawer')) btn.classList.add('is-active');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (document.getElementById('hu-ticket360-drawer')) {
        closeDrawer('hu-ticket360-drawer');
      } else {
        openTicket360Panel();
      }
    });
    container.insertBefore(btn, container.firstChild);
  }

  function scheduleAutoTicket360(attempt = 0) {
    if (!HU.settings.auto360) return;
    const ticketId = getCurrentTicketId();
    if (ticketId) {
      if (HU.ticket360TicketId === ticketId && document.getElementById('hu-ticket360-drawer')) return;
      openTicket360Panel();
      return;
    }
    if (attempt < 10) {
      setTimeout(() => scheduleAutoTicket360(attempt + 1), 500);
    }
  }

  function initNavigationTracking() {
    setTimeout(() => {
      sendContext();
      trackRecentRecord();
    }, 1200);

    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => {
          sendContext();
          trackRecentRecord();
          if (HU.fieldOverlayOn) revealFieldNames();
          injectTicket360Button();
          const newId = getCurrentTicketId();
          if (!newId) {
            closeDrawer('hu-ticket360-drawer');
            closeDrawer('hu-timeline-drawer');
          } else if (HU.settings.auto360) {
            scheduleAutoTicket360();
          } else {
            if (document.getElementById('hu-ticket360-drawer') && newId !== HU.ticket360TicketId) openTicket360Panel();
            if (document.getElementById('hu-timeline-drawer') && newId !== HU.timelineTicketId) openActionTimelinePanel();
          }
        }, 900);
      } else {
        if (HU.fieldOverlayOn) {
          clearTimeout(HU.overlayTimer);
          HU.overlayTimer = setTimeout(revealFieldNames, 400);
        }
        clearTimeout(HU.inject360Timer);
        HU.inject360Timer = setTimeout(injectTicket360Button, 600);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'RUN_HALO_REPORT') {
      runHaloReport(message.data?.sql, message.data?.name)
        .then(data => sendResponse({ ok: true, data }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === 'HU_OPEN_PALETTE') {
      openPalette(message.data?.seed || '');
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'HU_SHOW_RECENT') {
      showRecentPanel();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'HU_OPEN_TICKET360') {
      openTicket360Panel()
        .then(ok => sendResponse(ok ? { ok: true } : { ok: false, error: 'Open a ticket first.' }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === 'HU_OPEN_TIMELINE') {
      openActionTimelinePanel()
        .then(ok => sendResponse(ok ? { ok: true } : { ok: false, error: 'Open a ticket first.' }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === 'HU_TOGGLE_FIELDS') {
      toggleFieldOverlay();
      sendResponse({ ok: true, on: HU.fieldOverlayOn });
      return false;
    }

    if (message.type === 'HU_OPEN_JSON') {
      openJsonInspector();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'HU_GET_CONTEXT') {
      sendResponse({ ok: true, data: detectContext() });
      return false;
    }

    if (message.type === 'HU_NAVIGATE') {
      const path = message.data?.path;
      if (path) window.location.assign(new URL(path, window.location.origin).href);
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  document.addEventListener('dblclick', e => {
    const target = e.target;
    if (target.closest('#haloutils-palette-backdrop, .hu-drawer, .hu-toast')) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    toggleFieldOverlay();
  });

  initTheme();
  injectStyles();
  loadShortcuts();
  loadCustomCommands();
  loadRecentCommands();
  loadTicketTypes();
  loadRecent();
  loadImpersonationState();
  loadSettings();
  loadPaletteSettings();
  initPalette();
  initNavigationTracking();
  setTimeout(() => {
    injectTicket360Button();
    scheduleAutoTicket360();
  }, 1500);
})();




