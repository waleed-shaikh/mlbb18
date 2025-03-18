const multer = require("multer");
const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const adminAuthMiddleware = require("../middlewares/adminAuthMiddleware");

const {
  getAllUserController,
  getUserController,
  editUserController,
  deleteUserController,
  adminGetAllOrdersController,
  adminUpdateOrderController,
  getAllQueries,
  seenQueryController,
  getAllPaymentsController,
  getWebsiteContoller,
  updateWebsiteController,
  smileBalanceController
} = require("../controllers/AdminCtrl");
const browserMiddleware = require("../middlewares/browserMiddleware");

// router object
const router = express.Router();
// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "adsImages");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "--" + file.originalname.replace(/\s+/g, "-"));
  },
});

const upload = multer({ storage: storage });

// ============== ADMIN
router.get("/get-all-payments", adminAuthMiddleware, getAllPaymentsController);

// ============== USERS
router.get("/get-all-users", adminAuthMiddleware, getAllUserController);
router.get("/smile-balance", adminAuthMiddleware, smileBalanceController);
router.post("/get-user", adminAuthMiddleware, getUserController);
router.post("/delete-user", adminAuthMiddleware, deleteUserController);
router.post("/admin-edit-user", adminAuthMiddleware, editUserController);
// ============== ORDERS
router.get(
  "/admin-get-all-orders",
  adminAuthMiddleware,
  adminGetAllOrdersController
);
router.post("/update-order", adminAuthMiddleware, adminUpdateOrderController);
// ============== QUERIES
router.get("/get-all-queries", adminAuthMiddleware, getAllQueries);
router.post("/query-seen", adminAuthMiddleware, seenQueryController);

router.get("/get-website", browserMiddleware, getWebsiteContoller);
router.post("/update-website", adminAuthMiddleware, updateWebsiteController);

module.exports = router;
