const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const UserModel = require('../models/userModel');

router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.user.userId);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
