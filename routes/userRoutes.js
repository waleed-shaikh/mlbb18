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
const generalRateLimiter = require("../middlewares/generalRateLimiter");

// router object
const router = express.Router();
// routes
router.post("/login", generalRateLimiter, browserMiddleware, loginController);
router.post("/register", generalRateLimiter, browserMiddleware, registerController);
router.post(
  "/user-profile-update",
  generalRateLimiter,
  authMiddleware,
  userProfileUpdateController
);
router.post("/getUserData", authMiddleware, authController);

router.post("/send-otp", generalRateLimiter, browserMiddleware, sendMailController);
router.post("/verify-otp", generalRateLimiter, browserMiddleware, verifyOtpController);

module.exports = router;
