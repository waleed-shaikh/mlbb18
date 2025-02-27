const express = require("express");
const {} = require("../controllers/orderCtrl");
const {
  addWalletHistoryController,
  getWalletHistoryController,
} = require("../controllers/walletHistoryCtrl");
const browserMiddleware = require("../middlewares/browserMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// routes
router.post("/add-wallet-history", authMiddleware, addWalletHistoryController);
router.post("/get-wallet-history", authMiddleware, getWalletHistoryController);

module.exports = router;
