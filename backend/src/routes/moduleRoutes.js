const express = require('express');
const router = express.Router();
const { listModules, getModule } = require('../controllers/moduleController');
const { verifyToken } = require('../middleware/authMiddleware');

// Both callers of this route (ModuleCatalog, Workspace) live behind
// ProtectedRoute — without verifyToken here, req.user was always
// undefined, so HasAccess was computed as if every user were on the
// free plan regardless of what they actually purchased.
router.get('/', verifyToken, listModules);
router.get('/:slug', verifyToken, getModule);

module.exports = router;
