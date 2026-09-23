/* Shared report-type definitions for the Reports feature (frontend fallback
 * column headers — the backend also returns `columns` in its response, but
 * we hardcode these to render instantly and to survive a backend that isn't
 * ready yet / returns a slightly different shape). */

export const USER_REPORT_TYPES = [
  { value: 'learning',  label: 'Learning Progress', icon: '📘' },
  { value: 'execution', label: 'Code Execution',    icon: '⚙' },
  { value: 'snippets',  label: 'Saved Snippets',    icon: '💾' },
  { value: 'payments',  label: 'Payments',          icon: '💳' },
  { value: 'coins',     label: 'Coins',             icon: '🪙' },
];

export const ADMIN_REPORT_TYPES = [
  { value: 'users',      label: 'Users',       icon: '👥' },
  { value: 'revenue',    label: 'Revenue',     icon: '💰' },
  { value: 'modules',    label: 'Modules',     icon: '📘' },
  { value: 'executions', label: 'Executions',  icon: '⚙' },
  { value: 'activity',   label: 'Activity',    icon: '📈' },
  { value: 'feedback',   label: 'Feedback',    icon: '📝' },
  { value: 'audit',      label: 'Audit Logs',  icon: '🛡' },
  { value: 'submissions',label: 'Submissions', icon: '📤' },
];

export const REPORT_COLUMNS = {
  // user
  learning:  [ 'Module Name', 'Access Level', 'Progress', 'Status', 'Attempts', 'Started Date', 'Completion Date' ],
  execution: [ 'Execution Date', 'Language', 'Data Structure', 'Status', 'Number of Operations' ],
  snippets:  [ 'Snippet Name', 'Language', 'Data Structure', 'Created Date', 'Last Modified', 'Execution Count' ],
  payments:  [ 'Payment Date', 'Order ID', 'Plan', 'Amount', 'Discount', 'Coins Redeemed', 'Payment Method', 'Status' ],
  coins:     [ 'Date', 'Transaction Type', 'Coins Earned', 'Coins Redeemed', 'Balance', 'Reference' ],
  // admin
  users:      [ 'User ID', 'Name', 'Email', 'Role', 'Plan', 'Status', 'Registration Date', 'Last Login', 'Total Executions', 'Saved Snippets', 'Modules Completed', 'Coin Balance' ],
  revenue:    [ 'Payment Date', 'User', 'Order ID', 'Plan', 'Amount', 'Discount', 'Coins Redeemed', 'Payment Method', 'Status', 'Failure Reason' ],
  modules:    [ 'Module', 'Access Level', 'Users Started', 'Users Completed', 'Completion Rate', 'Average Attempts', 'Average Progress' ],
  executions: [ 'Date', 'Language', 'Module/Data Structure', 'Total Executions', 'Successful', 'Failed', 'Success Rate' ],
  activity:   [ 'Date/Time', 'User', 'Activity', 'Module', 'Result' ],
  feedback:   [ 'Date', 'User', 'Feedback', 'Status', 'Seen/Unseen' ],
  audit:      [ 'Date/Time', 'Admin', 'Action', 'Entity', 'Entity ID', 'Result' ],
  submissions:[ 'User', 'Module', 'Language', 'Submission Date', 'Execution Status' ],
};

// Status filter option sets per report type — kept generic; "All" always first.
export const STATUS_OPTIONS_BY_TYPE = {
  learning:  [ { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' } ],
  execution: [ { value: 'all', label: 'All' }, { value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' } ],
  snippets:  [ { value: 'all', label: 'All' } ],
  payments:  [ { value: 'all', label: 'All' }, { value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' }, { value: 'pending', label: 'Pending' } ],
  coins:     [ { value: 'all', label: 'All' } ],
  users:      [ { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'blocked', label: 'Blocked' }, { value: 'inactive', label: 'Inactive' } ],
  revenue:    [ { value: 'all', label: 'All' }, { value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' }, { value: 'pending', label: 'Pending' }, { value: 'refunded', label: 'Refunded' } ],
  modules:    [ { value: 'all', label: 'All' } ],
  executions: [ { value: 'all', label: 'All' }, { value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' } ],
  activity:   [ { value: 'all', label: 'All' } ],
  feedback:   [ { value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'reviewed', label: 'Reviewed' }, { value: 'resolved', label: 'Resolved' } ],
  audit:      [ { value: 'all', label: 'All' } ],
  submissions:[ { value: 'all', label: 'All' }, { value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' } ],
};

// Report types for which Module/Language filters make no sense.
export const HIDE_MODULE_LANGUAGE_FOR = new Set(['payments', 'coins', 'users', 'revenue', 'feedback', 'audit']);

export const LANGUAGES = ['python', 'cpp', 'java', 'c', 'csharp'];
export const LANG_LABELS = { python: 'Python', cpp: 'C++', java: 'Java', c: 'C', csharp: 'C#' };
