/**
 * Uniform pagination envelope used by every admin/user list endpoint.
 * { data, page, pageSize, totalRecords, totalPages }
 */
function buildEnvelope(data, page, pageSize, totalRecords) {
  return {
    data,
    page,
    pageSize,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
  };
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function parsePaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let pageSize = parseInt(query.pageSize, 10) || 20;
  if (!PAGE_SIZE_OPTIONS.includes(pageSize)) {
    pageSize = PAGE_SIZE_OPTIONS.reduce((closest, opt) =>
      Math.abs(opt - pageSize) < Math.abs(closest - pageSize) ? opt : closest, 20);
  }
  return { page, pageSize };
}

module.exports = { buildEnvelope, parsePaging, PAGE_SIZE_OPTIONS };
