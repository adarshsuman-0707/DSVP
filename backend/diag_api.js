require('dotenv').config();
const { getPool, sql } = require('./src/config/db');

// Test every admin controller function directly (no HTTP needed)
const {
  getDashboard, getUsers, getModules, createModule, updateModule,
  deleteModule, getPayments, getFeedback, getAnalytics,
} = require('./src/controllers/adminController');

// Fake req/res
function fakeReq(query = {}, params = {}, body = {}, userId = 1) {
  return { query, params, body, user: { userId, role: 'admin' } };
}
function fakeRes() {
  const res = {
    _status: 200, _data: null,
    status(s) { this._status = s; return this; },
    json(d)   { this._data = d; return this; },
  };
  return res;
}
function next(e) { console.error('NEXT(err):', e?.message || e); }

async function run(label, fn, req) {
  const res = fakeRes();
  try {
    await fn(req, res, next);
    if (res._status !== 200) {
      console.log(`❌ ${label} — HTTP ${res._status}:`, JSON.stringify(res._data));
    } else {
      const keys = Object.keys(res._data || {});
      console.log(`✅ ${label} — keys: [${keys.join(', ')}]`);
      // Show a summary of the data
      if (res._data.kpis)    console.log('   kpis:', JSON.stringify(res._data.kpis));
      if (res._data.users)   console.log('   users count:', res._data.users.length, '| total:', res._data.total);
      if (res._data.modules) console.log('   modules count:', res._data.modules.length);
      if (res._data.payments)console.log('   payments count:', res._data.payments.length);
      if (res._data.feedback)console.log('   feedback count:', res._data.feedback.length);
      if (res._data.runsByDay) console.log('   analytics runsByDay:', res._data.runsByDay.length, 'rows');
    }
  } catch (e) {
    console.log(`💥 ${label} — THREW: ${e.message}`);
    console.log('   stack:', e.stack?.split('\n').slice(0,3).join('\n'));
  }
}

(async () => {
  console.log('\n=== Testing admin controller functions ===\n');
  await run('getDashboard',  getDashboard, fakeReq());
  await run('getUsers',      getUsers,     fakeReq({ page:'1', pageSize:'10', search:'' }));
  await run('getModules',    getModules,   fakeReq());
  await run('getPayments',   getPayments,  fakeReq({ page:'1', status:'all' }));
  await run('getFeedback',   getFeedback,  fakeReq({ page:'1', status:'all' }));
  await run('getAnalytics',  getAnalytics, fakeReq({ days:'7' }));

  // Test createModule
  const res2 = fakeRes();
  try {
    await createModule(fakeReq({}, {}, { name:'Test Module', slug:'test-mod-diag', category:'array', isPremium:false, sortOrder:99 }), res2, next);
    console.log('✅ createModule —', res2._status, res2._data?.module ? `id=${res2._data.module.ModuleId}` : JSON.stringify(res2._data));
    
    if (res2._data?.module?.ModuleId) {
      const id = res2._data.module.ModuleId;
      // Test update
      const res3 = fakeRes();
      await updateModule(fakeReq({}, { id }, { name:'Test Module Updated', slug:'test-mod-diag', category:'array', isPremium:false, sortOrder:99, isActive:true }), res3, next);
      console.log('✅ updateModule —', res3._status, JSON.stringify(res3._data));
      
      // Test delete (soft)
      const res4 = fakeRes();
      await deleteModule(fakeReq({}, { id }), res4, next);
      console.log('✅ deleteModule —', res4._status, JSON.stringify(res4._data));
    }
  } catch(e) {
    console.log('💥 createModule threw:', e.message);
  }

  process.exit(0);
})();
