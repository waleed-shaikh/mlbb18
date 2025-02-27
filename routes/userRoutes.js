const express = require("express");
const {
  loginController,
  registerController,
  authController,
  sendMailController,
  verifyOtpController,
  userProfileUpdateController,
} = require("../controllers/userCtrl");
const authMiddleware = require("../middlewares/authMiddleware");
const browserMiddleware = require("../middlewares/browserMiddleware");

// router object
const router = express.Router();
// routes
router.post("/login", browserMiddleware, loginController);
router.post("/register", browserMiddleware, registerController);
router.post(
  "/user-profile-update",
  authMiddleware,
  userProfileUpdateController
);
router.post("/getUserData", authMiddleware, authController);

router.post("/send-otp", browserMiddleware, sendMailController);
router.post("/verify-otp", browserMiddleware, verifyOtpController);

module.exports = router;
