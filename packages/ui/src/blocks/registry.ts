import type { BlockMeta, BlockRegistry } from './types';

export const blockRegistry: BlockRegistry = {
  version: '1.0.0',
  blocks: [
    // Dashboard blocks
    {
      id: 'metric-card',
      name: 'MetricCard',
      category: 'dashboard',
      description: 'KPI metric card with trend indicator and sparkline',
      components: ['Card', 'Text', 'Badge'],
      tags: ['kpi', 'metric', 'dashboard', 'stat'],
    },
    {
      id: 'chart-panel',
      name: 'ChartPanel',
      category: 'dashboard',
      description: 'Chart container with title, toolbar, and responsive resize',
      components: ['Card', 'BarChart', 'LineChart'],
      tags: ['chart', 'graph', 'dashboard', 'analytics'],
    },
    {
      id: 'activity-feed',
      name: 'ActivityFeed',
      category: 'dashboard',
      description: 'Chronological activity list with avatar, timestamp, and action badges',
      components: ['Avatar', 'Text', 'Badge', 'Timeline'],
      tags: ['activity', 'feed', 'timeline', 'log'],
    },
    {
      id: 'kpi-grid',
      name: 'KPIGrid',
      category: 'dashboard',
      description: 'Responsive grid of KPI metric cards',
      components: ['Card', 'Text', 'Badge', 'Stack'],
      tags: ['kpi', 'grid', 'metrics', 'overview'],
    },
    {
      id: 'stat-widget',
      name: 'StatWidget',
      category: 'dashboard',
      description: 'Compact stat widget with icon, value, and change percentage',
      components: ['Card', 'Text', 'IconButton'],
      tags: ['stat', 'widget', 'number', 'compact'],
    },
    {
      id: 'overview-header',
      name: 'OverviewHeader',
      category: 'dashboard',
      description: 'Dashboard header with title, date range, and action buttons',
      components: ['PageHeader', 'Button', 'Select'],
      tags: ['header', 'dashboard', 'toolbar'],
    },

    // CRUD blocks
    {
      id: 'data-list',
      name: 'DataList',
      category: 'crud',
      description: 'Filterable data list with search, pagination, and row actions',
      components: ['Input', 'Select', 'Pagination', 'Button'],
      tags: ['list', 'data', 'search', 'pagination'],
    },
    {
      id: 'filter-panel',
      name: 'FilterPanel',
      category: 'crud',
      description: 'Side or top filter panel with multiple filter types',
      components: ['FilterBar', 'Input', 'Select', 'Checkbox', 'DatePicker', 'Button'],
      tags: ['filter', 'search', 'panel', 'sidebar'],
    },
    {
      id: 'detail-view',
      name: 'DetailView',
      category: 'crud',
      description: 'Entity detail view with sections, metadata, and action bar',
      components: ['DetailDrawer', 'Descriptions', 'Badge', 'Button', 'Tabs'],
      tags: ['detail', 'view', 'entity', 'info'],
    },
    {
      id: 'create-edit-form',
      name: 'CreateEditForm',
      category: 'crud',
      description: 'Create/edit form with validation, sections, and submit',
      components: ['FormDrawer', 'Input', 'Select', 'DatePicker', 'Button'],
      tags: ['form', 'create', 'edit', 'crud'],
    },
    {
      id: 'entity-table',
      name: 'EntityTable',
      category: 'crud',
      description: 'Full-featured data table with sort, filter, and export',
      components: ['EntityGridTemplate', 'FilterBar', 'Button'],
      tags: ['table', 'grid', 'data', 'sort', 'export'],
    },
    {
      id: 'bulk-action-bar',
      name: 'BulkActionBar',
      category: 'crud',
      description: 'Selection bar with count and bulk action buttons',
      components: ['Badge', 'Button', 'Stack'],
      tags: ['bulk', 'action', 'selection', 'toolbar'],
    },

    // Admin blocks
    {
      id: 'settings-panel',
      name: 'SettingsPanel',
      category: 'admin',
      description: 'Settings page with grouped switches and inputs',
      components: ['Card', 'Switch', 'Input', 'Select', 'Button'],
      tags: ['settings', 'config', 'preferences', 'admin'],
    },
    {
      id: 'user-management',
      name: 'UserManagement',
      category: 'admin',
      description: 'User list with search, role badges, and invite button',
      components: ['Input', 'Avatar', 'Badge', 'Button', 'Pagination'],
      tags: ['user', 'management', 'admin', 'roles'],
    },
    {
      id: 'role-matrix',
      name: 'RoleMatrix',
      category: 'admin',
      description: 'Permission matrix with role columns and feature rows',
      components: ['Checkbox', 'Text', 'Badge'],
      tags: ['role', 'permission', 'matrix', 'access'],
    },
    {
      id: 'notification-center',
      name: 'NotificationCenter',
      category: 'admin',
      description: 'Notification list with mark-read, filter, and clear all',
      components: ['Badge', 'Button', 'Tabs', 'Stack'],
      tags: ['notification', 'alert', 'inbox', 'admin'],
    },
    {
      id: 'audit-log',
      name: 'AuditLog',
      category: 'admin',
      description: 'Searchable audit log with actor, action, timestamp columns',
      components: ['Input', 'Select', 'Pagination', 'Badge'],
      tags: ['audit', 'log', 'history', 'admin'],
    },
    {
      id: 'system-health',
      name: 'SystemHealth',
      category: 'admin',
      description: 'System health dashboard with status indicators',
      components: ['Card', 'Badge', 'Text', 'Stack'],
      tags: ['health', 'status', 'monitoring', 'system'],
    },

    // Review blocks
    {
      id: 'approval-flow',
      name: 'ApprovalFlow',
      category: 'review',
      description: 'Multi-step approval workflow with status and actions',
      components: ['Steps', 'Badge', 'Button', 'Card'],
      tags: ['approval', 'workflow', 'review', 'steps'],
    },
    {
      id: 'audit-timeline',
      name: 'AuditTimeline',
      category: 'review',
      description: 'Audit trail timeline with actor, action, and timestamp',
      components: ['Timeline', 'Avatar', 'Badge', 'Text'],
      tags: ['audit', 'timeline', 'history', 'review'],
    },
    {
      id: 'comparison-view',
      name: 'ComparisonView',
      category: 'review',
      description: 'Side-by-side comparison with diff highlights',
      components: ['Card', 'Text', 'Badge', 'Tabs'],
      tags: ['compare', 'diff', 'review', 'side-by-side'],
    },
    {
      id: 'feedback-form',
      name: 'FeedbackForm',
      category: 'review',
      description: 'Feedback submission with rating, comment, and submit',
      components: ['Rating', 'Input', 'Button', 'Card'],
      tags: ['feedback', 'rating', 'review', 'comment'],
    },
    {
      id: 'review-checklist',
      name: 'ReviewChecklist',
      category: 'review',
      description: 'Checklist with progress tracking and sign-off',
      components: ['Checkbox', 'Badge', 'Button', 'Stack'],
      tags: ['checklist', 'review', 'progress', 'sign-off'],
    },
    {
      id: 'version-history',
      name: 'VersionHistory',
      category: 'review',
      description: 'Version list with rollback and comparison actions',
      components: ['Timeline', 'Badge', 'Button', 'Text'],
      tags: ['version', 'history', 'rollback', 'compare'],
    },

    // Form blocks
    {
      id: 'login-form',
      name: 'LoginForm',
      category: 'form',
      description: 'Login form with email, password, remember me, and SSO',
      components: ['Input', 'Checkbox', 'Button', 'Card'],
      tags: ['login', 'auth', 'form', 'signin'],
    },
    {
      id: 'registration-form',
      name: 'RegistrationForm',
      category: 'form',
      description: 'Registration form with validation and terms acceptance',
      components: ['Input', 'Select', 'Checkbox', 'Button'],
      tags: ['register', 'signup', 'form', 'onboard'],
    },
    {
      id: 'profile-form',
      name: 'ProfileForm',
      category: 'form',
      description: 'User profile edit form with avatar upload',
      components: ['Input', 'Select', 'Upload', 'Avatar', 'Button'],
      tags: ['profile', 'user', 'edit', 'form'],
    },
    {
      id: 'wizard-form',
      name: 'WizardForm',
      category: 'form',
      description: 'Multi-step form wizard with progress indicator',
      components: ['Steps', 'Input', 'Select', 'Button'],
      tags: ['wizard', 'stepper', 'multi-step', 'form'],
    },
    {
      id: 'search-form',
      name: 'SearchForm',
      category: 'form',
      description: 'Advanced search form with collapsible filters',
      components: ['SearchInput', 'Select', 'DatePicker', 'Button', 'Accordion'],
      tags: ['search', 'filter', 'advanced', 'form'],
    },

    // Layout blocks
    {
      id: 'sidebar-layout',
      name: 'SidebarLayout',
      category: 'layout',
      description: 'App shell with sidebar navigation and main content',
      components: ['PageLayout', 'NavigationRail', 'PageHeader'],
      tags: ['sidebar', 'layout', 'navigation', 'shell'],
    },
    {
      id: 'dashboard-layout',
      name: 'DashboardLayout',
      category: 'layout',
      description: 'Dashboard grid layout with responsive columns',
      components: ['PageLayout', 'PageHeader', 'Stack'],
      tags: ['dashboard', 'grid', 'layout', 'responsive'],
    },
    {
      id: 'master-detail-layout',
      name: 'MasterDetailLayout',
      category: 'layout',
      description: 'Master list with detail panel layout',
      components: ['MasterDetail', 'FilterBar', 'DetailDrawer'],
      tags: ['master', 'detail', 'layout', 'split'],
    },

    // Phase 2a (2026-05-14) — moved from enterprise/
    // NOTE: activity-feed and notification-center placeholders already exist
    // above (registry.ts:24, :132); we keep those entries and only add the
    // 3 net-new blocks here.
    {
      id: 'status-timeline',
      name: 'StatusTimeline',
      category: 'review',
      description: 'Vertical timeline of workflow status events',
      components: ['Timeline', 'Badge'],
      tags: ['status', 'timeline', 'workflow'],
    },
    {
      id: 'gantt-timeline',
      name: 'GanttTimeline',
      category: 'dashboard',
      description: 'Project Gantt chart with bars, milestones, and dependency lines',
      components: ['Card', 'Text'],
      tags: ['project', 'gantt', 'timeline', 'planning'],
    },
    {
      id: 'process-flow',
      name: 'ProcessFlow',
      category: 'review',
      description: 'Process flow diagram with typed nodes and step transitions',
      components: ['Card', 'Text'],
      tags: ['process', 'workflow', 'flow', 'steps'],
    },

    // Phase 2b (2026-05-15) — chart-adjacent
    {
      id: 'bullet-chart',
      name: 'BulletChart',
      category: 'dashboard',
      description: 'Single-metric bullet chart with ranges and target marker',
      components: ['Card', 'Text'],
      tags: ['bullet', 'chart', 'kpi', 'performance'],
    },
    {
      id: 'micro-chart',
      name: 'MicroChart',
      category: 'dashboard',
      description: 'Tiny inline sparkline/waffle/donut/progress chart family',
      components: ['Text'],
      tags: ['sparkline', 'mini', 'inline', 'chart'],
    },
    {
      id: 'box-plot',
      name: 'BoxPlot',
      category: 'dashboard',
      description: 'Statistical box plot with quartiles, median, outliers',
      components: ['Card', 'Text'],
      tags: ['boxplot', 'statistics', 'distribution'],
    },
    {
      id: 'histogram-chart',
      name: 'HistogramChart',
      category: 'dashboard',
      description: 'Histogram chart with binned frequency distribution',
      components: ['Card', 'Text'],
      tags: ['histogram', 'frequency', 'distribution'],
    },
    {
      id: 'control-chart',
      name: 'ControlChart',
      category: 'dashboard',
      description: 'Statistical process control chart with UCL/LCL bands',
      components: ['Card', 'Text'],
      tags: ['spc', 'control', 'process', 'quality'],
    },
    {
      id: 'pareto-chart',
      name: 'ParetoChart',
      category: 'dashboard',
      description: 'Pareto chart with 80/20 cumulative ranking',
      components: ['Card', 'Text'],
      tags: ['pareto', '80-20', 'ranking', 'defect'],
    },

    // Phase 2c (2026-05-15) — workspace
    {
      id: 'sankey-diagram',
      name: 'SankeyDiagram',
      category: 'dashboard',
      description: 'Sankey flow diagram with nodes and weighted links',
      components: ['Card', 'Text'],
      tags: ['sankey', 'flow', 'diagram', 'weighted'],
    },
    {
      id: 'heatmap-calendar',
      name: 'HeatmapCalendar',
      category: 'dashboard',
      description: 'GitHub-style day heatmap calendar with date range',
      components: ['Card', 'Text'],
      tags: ['heatmap', 'calendar', 'activity', 'github'],
    },
    {
      id: 'org-chart',
      name: 'OrgChart',
      category: 'review',
      description: 'Hierarchical organization chart with avatars and roles',
      components: ['Avatar', 'Text', 'Card'],
      tags: ['org', 'chart', 'hierarchy', 'team'],
    },
    {
      id: 'pivot-table',
      name: 'PivotTable',
      category: 'crud',
      description: 'Interactive pivot table with row/column/value config',
      components: ['Table', 'Text'],
      tags: ['pivot', 'table', 'data', 'aggregation'],
    },
    {
      id: 'comment-thread',
      name: 'CommentThread',
      category: 'review',
      description: 'Threaded comment list with avatars and reply actions',
      components: ['Avatar', 'Text', 'Button'],
      tags: ['comment', 'thread', 'discussion', 'review'],
    },
    {
      id: 'file-upload-zone',
      name: 'FileUploadZone',
      category: 'form',
      description: 'Drag-and-drop file upload zone with progress',
      components: ['Button', 'Text'],
      tags: ['upload', 'file', 'drag-drop', 'form'],
    },
    {
      id: 'filter-presets',
      name: 'FilterPresets',
      category: 'crud',
      description: 'Saved filter preset chips with active state',
      components: ['Badge', 'Button', 'Stack'],
      tags: ['filter', 'preset', 'saved', 'chip'],
    },
    {
      id: 'value-stream',
      name: 'ValueStream',
      category: 'review',
      description: 'Value stream map with steps, waits, and lean metrics',
      components: ['Card', 'Text'],
      tags: ['value', 'stream', 'lean', 'vsm', 'process'],
    },

    // Phase 4 (2026-05-15) — moved from enterprise/ showcase
    {
      id: 'risk-matrix',
      name: 'RiskMatrix',
      category: 'review',
      description: 'Likelihood vs impact risk matrix with risk items plotted',
      components: ['Card', 'Text', 'Badge'],
      tags: ['risk', 'matrix', 'review', 'likelihood', 'impact'],
    },
  ],
};

/** Get all blocks */
export function getAllBlocks(): BlockMeta[] {
  return blockRegistry.blocks;
}

/** Get blocks by category */
export function getBlocksByCategory(category: BlockMeta['category']): BlockMeta[] {
  return blockRegistry.blocks.filter((b) => b.category === category);
}

/** Search blocks by query */
export function searchBlocks(query: string): BlockMeta[] {
  const lower = query.toLowerCase();
  return blockRegistry.blocks
    .filter(
      (b) =>
        b.name.toLowerCase().includes(lower) ||
        b.description.toLowerCase().includes(lower) ||
        b.tags.some((t) => t.includes(lower)),
    )
    .slice(0, 10);
}

/** Get block by id */
export function getBlock(id: string): BlockMeta | undefined {
  return blockRegistry.blocks.find((b) => b.id === id);
}
