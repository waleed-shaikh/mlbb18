const userModel = require("../models/userModel");
const axios = require("axios");
const subscribeModel = require("../models/subcribeModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendMail = require("./sendMail");
const sendSMS = require("./sendSMS");
const crypto = require("crypto");

// Encrypt OTP
function encrypt(text, key, iv) {
  let cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString("hex");
}
// Define your encryption key and initialization vector
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

const registerController = async (req, res) => {
  try {
    const { email, mobile } = req.body;
    const existingUser = await userModel.findOne({
      $or: [{ email }, { mobile }],
    });
    if (existingUser) {
      const msg =
        existingUser.email === email
          ? "Email Already Exists"
          : "Mobile Number Already Exists";
      return res.status(201).send({ success: false, message: msg });
    }
    if (
      req.body.balance ||
      req.body.isAdmin ||
      req.body.reseller ||
      req.body.mobileVerified ||
      req.body.emailVerified
    ) {
      return res
        .status(201)
        .send({ success: false, message: "Failed to Register" });
    }
    const password = req.body.password;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    req.body.password = hashedPassword;
    const newUser = new userModel({
      ...req.body,
      mobileVerified: true,
      // emailVerified: true,
    });
    await newUser.save();
    return res
      .status(201)
      .send({ success: true, message: "Registration Successful" });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: `Register Controller ${error.message}`,
    });
  }
};

const loginController = async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.body.email });
    if (!user) {
      return res
        .status(200)
        .send({ success: false, message: "User not found" });
    }
    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
      return res
        .status(200)
        .send({ success: false, message: "Invalid Credentials" });
    }
    const isAdmin = user?.isAdmin || false;
    const expiresIn = isAdmin ? "1d" : "30d";

    const token = jwt.sign({ id: user._id, isAdmin }, process.env.JWT_SECRET, {
      expiresIn: expiresIn,
    });

    if (isMatch) {
      user.lastLogin = new Date();
      await user.save();
    }

    return res
      .status(200)
      .send({ success: true, message: "Login Successful", token, isAdmin });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: true,
      message: `Login Controller ${error.message}`,
    });
  }
};

const authController = async (req, res) => {
  try {
    const user = await userModel.findOne({ _id: req.body.userId });
    if (!user) {
      return res
        .status(200)
        .send({ success: false, message: "User Not Found" });
    } else {
      user.password = undefined;
      const id = encrypt(user?.balance.toString(), key, iv);
      user.balance = undefined;

      return res.status(200).send({
        success: true,
        data: {
          user,
          id,
          key: key.toString("hex"),
          iv: iv.toString("hex"),
        },
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: "Auth Error", error });
  }
};

const userProfileUpdateController = async (req, res) => {
  try {
    const { userId, password, fname, gender, state } = req.body;

    const userExist = await userModel.findOne({ _id: userId });

    if (!userExist) {
      return res.status(200).send({
        success: false,
        message: "User Not Found",
      });
    }

    if (userExist?.email === process.env.CLIENT_EMAIL) {
      return res.status(201).send({
        success: false,
        message: "you are not allowed to update the user data",
      });
    }

    // Prepare data for update, excluding undefined fields
    const updateData = {};
    if (fname) updateData.fname = fname;

    // Handle password separately
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      updateData.password = hashedPassword;
    }

    // Update user data
    const userUpdate = await userModel.findOneAndUpdate(
      { _id: userId },
      { $set: updateData },
      { new: true } // Return the updated document
    );

    if (!userUpdate) {
      return res.status(404).send({
        success: false,
        message: "Failed to update user profile",
      });
    }

    return res.status(200).send({
      success: true,
      message: "Profile Updated",
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: `User Profile Update Ctrl ${error.message}`,
    });
  }
};

const sendMailController = async (req, res) => {
  try {
    if (req.body.email === process.env.CLIENT_EMAIL) {
      return res.status(200).send({
        success: false,
        message: "You are not allowed to change password",
      });
    }
    const user = await userModel.findOne({ email: req.body.email });
    if (!user) {
      return res
        .status(200)
        .send({ success: false, message: "Email Not Registered With Us" });
    }

    const generateUniqueOtp = () => {
      const randomDigits = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
      const timestampPart = Date.now().toString().slice(-3); // Last 3 digits of the current timestamp
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"; // Character pool
      const randomChar1 =
        characters[Math.floor(Math.random() * characters.length)];
      const randomChar2 =
        characters[Math.floor(Math.random() * characters.length)];
      return `${randomChar1}${randomDigits}${randomChar2}${timestampPart}`.slice(
        0,
        8
      );
    };
    const emailOtp = generateUniqueOtp();

    const savedOtpUser = await userModel.findOneAndUpdate(
      { email: req.body.email },
      { $set: { emailOtp: emailOtp } },
      { new: true }
    );
    if (!savedOtpUser) {
      return res
        .status(201)
        .send({ success: false, message: "Error In saving Otp" });
    }
    await sendMail(
      savedOtpUser?.email,
      "Email Verification OTP",
      emailOtp,
      req.body.msg
    );

    // Set emailOtpCreatedAt to null after 60 seconds
    setTimeout(async () => {
      await userModel.findOneAndUpdate(
        { _id: savedOtpUser._id },
        { $set: { emailOtp: null } },
        { new: true }
      );
      console.log("otp expired");
    }, 60000); // 60 seconds

    return res.status(203).send({
      success: true,
      message: "Otp Send Successfully",
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: `Send Mail Controller ${error.message}`,
    });
  }
};
const verifyOtpController = async (req, res) => {
  try {
    if (req.body.email === process.env.CLIENT_EMAIL) {
      return res.status(200).send({
        success: false,
        message: "You are not allowed to change password",
      });
    }
    const user = await userModel.findOne({ email: req.body.email });
    if (!user) {
      return res
        .status(200)
        .send({ success: false, message: "User Not Found" });
    }

    if (!user.emailOtp) {
      return res.status(200).send({ success: false, message: "OTP Expired" });
    }

    if (user.emailOtp !== req.body.userEnteredOtp) {
      return res.status(201).send({ success: false, message: "Incorrect OTP" });
    } else {
      const password = req.body.pass;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const updateUser = await userModel.findOneAndUpdate(
        { email: req.body.email },
        { $set: { password: hashedPassword } },
        { new: true }
      );
      if (!updateUser) {
        return res
          .status(200)
          .send({ success: false, message: "Failed to Verify" });
      }
      return res.status(202).send({
        success: true,
        message: "Password update successfully",
        data: user,
      });
    }
  } catch (error) {
    res.status(500).send({
      success: false,
      message: `Verify Otp Controller ${error.message}`,
    });
  }
};

module.exports = {
  loginController,
  registerController,
  authController,
  sendMailController,
  verifyOtpController,
  userProfileUpdateController,
};
