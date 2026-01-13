export enum PermissionCategory {
    LEADS = 'LEADS',
    CASES = 'CASES',
    USERS = 'USERS',
    REPORTS = 'REPORTS',
    SETTINGS = 'SETTINGS',
    AUDIT = 'AUDIT'
}

export enum PermissionScope {
    OWN = 'own',           // Only own records
    ASSIGNED = 'assigned', // Assigned records
    TEAM = 'team',         // Team members' records
    ALL = 'all'            // All records
}

export const PERMISSIONS = {
    // Lead permissions
    LEADS_CREATE: 'leads.create',
    LEADS_VIEW_OWN: 'leads.view.own',
    LEADS_VIEW_ASSIGNED: 'leads.view.assigned',
    LEADS_VIEW_ALL: 'leads.view.all',
    LEADS_EDIT_OWN: 'leads.edit.own',
    LEADS_EDIT_ASSIGNED: 'leads.edit.assigned',
    LEADS_EDIT_ALL: 'leads.edit.all',
    LEADS_DELETE_OWN: 'leads.delete.own',
    LEADS_DELETE_ALL: 'leads.delete.all',
    LEADS_ASSIGN: 'leads.assign',
    LEADS_REASSIGN: 'leads.reassign',
    LEADS_FORWARD: 'leads.forward',
    LEADS_EXPORT: 'leads.export',

    // Case permissions
    CASES_CREATE: 'cases.create',
    CASES_VIEW_OWN: 'cases.view.own',
    CASES_VIEW_ASSIGNED: 'cases.view.assigned',
    CASES_VIEW_ALL: 'cases.view.all',
    CASES_EDIT_OWN: 'cases.edit.own',
    CASES_EDIT_ASSIGNED: 'cases.edit.assigned',
    CASES_EDIT_ALL: 'cases.edit.all',
    CASES_DELETE: 'cases.delete',
    CASES_ASSIGN: 'cases.assign',
    CASES_CHANGE_STATUS: 'cases.change_status',
    CASES_APPROVE: 'cases.approve',
    CASES_EXPORT: 'cases.export',

    // User management permissions
    USERS_CREATE: 'users.create',
    USERS_VIEW: 'users.view',
    USERS_EDIT: 'users.edit',
    USERS_DELETE: 'users.delete',
    USERS_RESET_PASSWORD: 'users.reset_password',
    USERS_IMPERSONATE: 'users.impersonate',
    USERS_MANAGE_ROLES: 'users.manage_roles',

    // Report permissions
    REPORTS_VIEW_SALES: 'reports.view.sales',
    REPORTS_VIEW_PROCESS: 'reports.view.process',
    REPORTS_VIEW_EXECUTIVE: 'reports.view.executive',
    REPORTS_VIEW_OWN: 'reports.view.own',
    REPORTS_VIEW_ALL: 'reports.view.all',
    REPORTS_VIEW_TEAM: 'reports.view.team',
    REPORTS_CREATE: 'reports.create',
    REPORTS_EDIT: 'reports.edit',
    REPORTS_DELETE: 'reports.delete',
    REPORTS_SHARE: 'reports.share',
    REPORTS_SCHEDULE: 'reports.schedule',
    REPORTS_EXPORT: 'reports.export',

    // Settings permissions
    SETTINGS_VIEW: 'settings.view',
    SETTINGS_EDIT: 'settings.edit',
    SETTINGS_MANAGE_TENANTS: 'settings.manage_tenants',
    SETTINGS_MANAGE_SSO: 'settings.manage_sso',

    // Audit permissions
    AUDIT_EXPORT: 'audit.export',
    AUDIT_DELETE: 'audit.delete',

    // Documents
    DOCUMENTS_UPLOAD: 'documents.upload',
    DOCUMENTS_VIEW_ALL: 'documents.view.all',
    DOCUMENTS_VIEW_CASE: 'documents.view.case',
    DOCUMENTS_EDIT: 'documents.edit',
    DOCUMENTS_DELETE: 'documents.delete',
    DOCUMENTS_VERIFY: 'documents.verify',
    DOCUMENTS_DOWNLOAD: 'documents.download',

    // Email
    EMAIL_VIEW: 'email.view',
    EMAIL_VIEW_OWN: 'email.view.own',
    EMAIL_VIEW_TEAM: 'email.view.team',
    EMAIL_SEND: 'email.send',
    EMAIL_DELETE: 'email.delete',

    // Templates
    EMAIL_TEMPLATE_VIEW: 'email.template.view',
    EMAIL_TEMPLATE_CREATE: 'email.template.create',
    EMAIL_TEMPLATE_EDIT: 'email.template.edit',
    EMAIL_TEMPLATE_DELETE: 'email.template.delete',

    // Campaigns
    EMAIL_CAMPAIGN_VIEW: 'email.campaign.view',
    EMAIL_CAMPAIGN_CREATE: 'email.campaign.create',
    EMAIL_CAMPAIGN_EDIT: 'email.campaign.edit',
    EMAIL_CAMPAIGN_DELETE: 'email.campaign.delete',
    EMAIL_CAMPAIGN_SEND: 'email.campaign.send',

    // Calendar
    CALENDAR_VIEW: 'calendar.view',
    CALENDAR_VIEW_OWN: 'calendar.view.own',
    CALENDAR_VIEW_TEAM: 'calendar.view.team',
    CALENDAR_CREATE: 'calendar.create',
    CALENDAR_EDIT: 'calendar.edit',
    CALENDAR_DELETE: 'calendar.delete',

    // Workflow Automation
    WORKFLOWS_VIEW: 'workflows.view',
    WORKFLOWS_CREATE: 'workflows.create',
    WORKFLOWS_EDIT: 'workflows.edit',
    WORKFLOWS_DELETE: 'workflows.delete',
    WORKFLOWS_ACTIVATE: 'workflows.activate',
    WORKFLOWS_TEST: 'workflows.test',
    WORKFLOWS_VIEW_EXECUTIONS: 'workflows.view_executions',
    WORKFLOWS_MANAGE: 'workflows.manage',

    // Approvals
    APPROVALS_VIEW: 'approvals.view',
    APPROVALS_APPROVE: 'approvals.approve',
    APPROVALS_MANAGE: 'approvals.manage',

    // SLA
    SLA_VIEW: 'sla.view',
    SLA_MANAGE: 'sla.manage',
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const SENSITIVE_FIELDS = {
    leads: ['salary', 'budget', 'commission', 'internalNotes'],
    cases: ['financialDetails', 'internalComments', 'profitMargin'],
    users: ['password', 'salary', 'commission']
};

export const PERMISSION_METADATA: Record<string, {
    label: string;
    description: string;
    category: PermissionCategory;
    scope?: PermissionScope;
}> = {
    'leads.create': {
        label: 'Create Leads',
        description: 'Create new leads in the system',
        category: PermissionCategory.LEADS
    },
    'leads.view.own': {
        label: 'View Own Leads',
        description: 'View leads created by the user',
        category: PermissionCategory.LEADS,
        scope: PermissionScope.OWN
    },
    'leads.view.assigned': {
        label: 'View Assigned Leads',
        description: 'View leads assigned to the user',
        category: PermissionCategory.LEADS,
        scope: PermissionScope.ASSIGNED
    },
    'leads.view.all': {
        label: 'View All Leads',
        description: 'View all leads in the system',
        category: PermissionCategory.LEADS,
        scope: PermissionScope.ALL
    },
    'leads.edit.own': {
        label: 'Edit Own Leads',
        description: 'Edit leads created by the user',
        category: PermissionCategory.LEADS,
        scope: PermissionScope.OWN
    },
    'leads.edit.assigned': {
        label: 'Edit Assigned Leads',
        description: 'Edit leads assigned to the user',
        category: PermissionCategory.LEADS,
        scope: PermissionScope.ASSIGNED
    },
    'leads.edit.all': {
        label: 'Edit All Leads',
        description: 'Edit all leads in the system',
        category: PermissionCategory.LEADS,
        scope: PermissionScope.ALL
    },
    'leads.delete.own': {
        label: 'Delete Own Leads',
        description: 'Delete leads created by the user',
        category: PermissionCategory.LEADS,
        scope: PermissionScope.OWN
    },
    'leads.delete.all': {
        label: 'Delete All Leads',
        description: 'Delete any lead in the system',
        category: PermissionCategory.LEADS,
        scope: PermissionScope.ALL
    },
    'leads.assign': {
        label: 'Assign Leads',
        description: 'Assign leads to other users',
        category: PermissionCategory.LEADS
    },
    'leads.reassign': {
        label: 'Reassign Leads',
        description: 'Change assignment of leads',
        category: PermissionCategory.LEADS
    },
    'leads.forward': {
        label: 'Forward Leads',
        description: 'Forward leads to other departments',
        category: PermissionCategory.LEADS
    },
    'leads.export': {
        label: 'Export Leads',
        description: 'Export lead data',
        category: PermissionCategory.LEADS
    },

    'cases.create': {
        label: 'Create Cases',
        description: 'Create new cases',
        category: PermissionCategory.CASES
    },
    'cases.view.own': {
        label: 'View Own Cases',
        description: 'View cases created by the user',
        category: PermissionCategory.CASES,
        scope: PermissionScope.OWN
    },
    'cases.view.assigned': {
        label: 'View Assigned Cases',
        description: 'View cases assigned to the user',
        category: PermissionCategory.CASES,
        scope: PermissionScope.ASSIGNED
    },
    'cases.view.all': {
        label: 'View All Cases',
        description: 'View all cases in the system',
        category: PermissionCategory.CASES,
        scope: PermissionScope.ALL
    },
    'cases.edit.own': {
        label: 'Edit Own Cases',
        description: 'Edit cases created by the user',
        category: PermissionCategory.CASES,
        scope: PermissionScope.OWN
    },
    'cases.edit.assigned': {
        label: 'Edit Assigned Cases',
        description: 'Edit cases assigned to the user',
        category: PermissionCategory.CASES,
        scope: PermissionScope.ASSIGNED
    },
    'cases.edit.all': {
        label: 'Edit All Cases',
        description: 'Edit all cases in the system',
        category: PermissionCategory.CASES,
        scope: PermissionScope.ALL
    },
    'cases.delete': {
        label: 'Delete Cases',
        description: 'Delete cases',
        category: PermissionCategory.CASES
    },
    'cases.assign': {
        label: 'Assign Cases',
        description: 'Assign cases to users',
        category: PermissionCategory.CASES
    },
    'cases.change_status': {
        label: 'Change Status',
        description: 'Change case status',
        category: PermissionCategory.CASES
    },
    'cases.approve': {
        label: 'Approve Cases',
        description: 'Approve cases',
        category: PermissionCategory.CASES
    },
    'cases.export': {
        label: 'Export Cases',
        description: 'Export case data',
        category: PermissionCategory.CASES
    },

    'users.create': {
        label: 'Create Users',
        description: 'Create new user accounts',
        category: PermissionCategory.USERS
    },
    'users.view': {
        label: 'View Users',
        description: 'View user list and details',
        category: PermissionCategory.USERS
    },
    'users.edit': {
        label: 'Edit Users',
        description: 'Edit user details',
        category: PermissionCategory.USERS
    },
    'users.delete': {
        label: 'Delete Users',
        description: 'Delete user accounts',
        category: PermissionCategory.USERS
    },
    'users.reset_password': {
        label: 'Reset Password',
        description: 'Reset user passwords',
        category: PermissionCategory.USERS
    },
    'users.impersonate': {
        label: 'Impersonate Users',
        description: 'Login as another user for support',
        category: PermissionCategory.USERS
    },
    'users.manage_roles': {
        label: 'Manage Roles',
        description: 'Create and edit roles and permissions',
        category: PermissionCategory.USERS
    },

    'reports.view.sales': {
        label: 'View Sales Reports',
        description: 'Access sales-related reports',
        category: PermissionCategory.REPORTS
    },
    'reports.view.process': {
        label: 'View Process Reports',
        description: 'Access process-related reports',
        category: PermissionCategory.REPORTS
    },
    'reports.view.executive': {
        label: 'View Executive Reports',
        description: 'Access executive dashboards',
        category: PermissionCategory.REPORTS
    },
    'reports.export': {
        label: 'Export Reports',
        description: 'Export report data',
        category: PermissionCategory.REPORTS
    },
    'reports.view.own': {
        label: 'View Own Reports',
        description: 'View reports created by user',
        category: PermissionCategory.REPORTS,
        scope: PermissionScope.OWN
    },
    'reports.view.all': {
        label: 'View All Reports',
        description: 'View all saved reports',
        category: PermissionCategory.REPORTS,
        scope: PermissionScope.ALL
    },
    'reports.view.team': {
        label: 'View Team Reports',
        description: 'View team performance reports',
        category: PermissionCategory.REPORTS,
        scope: PermissionScope.TEAM
    },
    'reports.create': {
        label: 'Create Reports',
        description: 'Create new custom reports',
        category: PermissionCategory.REPORTS
    },
    'reports.edit': {
        label: 'Edit Reports',
        description: 'Edit existing reports',
        category: PermissionCategory.REPORTS
    },
    'reports.delete': {
        label: 'Delete Reports',
        description: 'Delete saved reports',
        category: PermissionCategory.REPORTS
    },
    'reports.share': {
        label: 'Share Reports',
        description: 'Share reports with other users',
        category: PermissionCategory.REPORTS
    },
    'reports.schedule': {
        label: 'Schedule Reports',
        description: 'Schedule automated report emails',
        category: PermissionCategory.REPORTS
    },

    'settings.view': {
        label: 'View Settings',
        description: 'View system settings',
        category: PermissionCategory.SETTINGS
    },
    'settings.edit': {
        label: 'Edit Settings',
        description: 'Modify system settings',
        category: PermissionCategory.SETTINGS
    },
    'settings.manage_tenants': {
        label: 'Manage Tenants',
        description: 'Create and manage tenants',
        category: PermissionCategory.SETTINGS
    },
    'settings.manage_sso': {
        label: 'Manage SSO',
        description: 'Configure SSO settings',
        category: PermissionCategory.SETTINGS
    },

    'audit.view': {
        label: 'View Audit Logs',
        description: 'View system audit logs',
        category: PermissionCategory.AUDIT
    },
    'audit.export': {
        label: 'Export Audit Logs',
        description: 'Export audit data',
        category: PermissionCategory.AUDIT
    },
    'audit.delete': {
        label: 'Delete Audit Logs',
        description: 'Delete audit records (requires high privilege)',
        category: PermissionCategory.AUDIT
    },

    'documents.upload': {
        label: 'Upload Documents',
        description: 'Upload new documents',
        category: PermissionCategory.CASES
    },
    'documents.view.all': {
        label: 'View All Documents',
        description: 'View all documents in the system',
        category: PermissionCategory.CASES,
        scope: PermissionScope.ALL
    },
    'documents.view.case': {
        label: 'View Case Documents',
        description: 'View documents for assigned cases',
        category: PermissionCategory.CASES,
        scope: PermissionScope.ASSIGNED
    },
    'documents.edit': {
        label: 'Edit Documents',
        description: 'Edit document metadata',
        category: PermissionCategory.CASES
    },
    'documents.delete': {
        label: 'Delete Documents',
        description: 'Delete documents',
        category: PermissionCategory.CASES
    },
    'documents.verify': {
        label: 'Verify Documents',
        description: 'Mark documents as verified',
        category: PermissionCategory.CASES
    },
    'documents.download': {
        label: 'Download Documents',
        description: 'Download document files',
        category: PermissionCategory.CASES
    },

    // Email Permissions
    'email.view': {
        label: 'View Emails',
        description: 'View global email list',
        category: PermissionCategory.CASES
    },
    'email.view.own': {
        label: 'View Own Emails',
        description: 'View emails sent/received by user',
        category: PermissionCategory.CASES,
        scope: PermissionScope.OWN
    },
    'email.view.team': {
        label: 'View Team Emails',
        description: 'View emails of team members',
        category: PermissionCategory.CASES,
        scope: PermissionScope.TEAM
    },
    'email.send': {
        label: 'Send Emails',
        description: 'Send emails via connected providers',
        category: PermissionCategory.CASES
    },
    'email.delete': {
        label: 'Delete Emails',
        description: 'Delete emails',
        category: PermissionCategory.CASES
    },

    // Templates
    'email.template.view': {
        label: 'View Templates',
        description: 'View email templates',
        category: PermissionCategory.CASES
    },
    'email.template.create': {
        label: 'Create Templates',
        description: 'Create new email templates',
        category: PermissionCategory.CASES
    },
    'email.template.edit': {
        label: 'Edit Templates',
        description: 'Edit email templates',
        category: PermissionCategory.CASES
    },
    'email.template.delete': {
        label: 'Delete Templates',
        description: 'Delete email templates',
        category: PermissionCategory.CASES
    },

    // Campaigns
    'email.campaign.view': {
        label: 'View Campaigns',
        description: 'View email campaigns',
        category: PermissionCategory.CASES
    },
    'email.campaign.create': {
        label: 'Create Campaigns',
        description: 'Create new email campaigns',
        category: PermissionCategory.CASES
    },
    'email.campaign.edit': {
        label: 'Edit Campaigns',
        description: 'Edit email campaigns',
        category: PermissionCategory.CASES
    },
    'email.campaign.delete': {
        label: 'Delete Campaigns',
        description: 'Delete email campaigns',
        category: PermissionCategory.CASES
    },
    'email.campaign.send': {
        label: 'Send Campaigns',
        description: 'Trigger email campaigns',
        category: PermissionCategory.CASES
    },

    // Calendar
    'calendar.view': {
        label: 'View Calendar',
        description: 'View calendar events',
        category: PermissionCategory.CASES
    },
    'calendar.view.own': {
        label: 'View Own Calendar',
        description: 'View own calendar events',
        category: PermissionCategory.CASES,
        scope: PermissionScope.OWN
    },
    'calendar.view.team': {
        label: 'View Team Calendar',
        description: 'View team calendar events',
        category: PermissionCategory.CASES,
        scope: PermissionScope.TEAM
    },
    'calendar.create': {
        label: 'Create Calendar Events',
        description: 'Create new calendar events',
        category: PermissionCategory.CASES
    },
    'calendar.edit': {
        label: 'Edit Calendar Events',
        description: 'Edit calendar events',
        category: PermissionCategory.CASES
    },
    'calendar.delete': {
        label: 'Delete Calendar Events',
        description: 'Delete calendar events',
        category: PermissionCategory.CASES
    }
};
