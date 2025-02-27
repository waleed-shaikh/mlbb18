const express = require("express");
const contactModel = require("../models/contactModel");
const browserMiddleware = require("../middlewares/browserMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");

// router object
const router = express.Router();

// routes
router.post("/add-contact-form", browserMiddleware, async (req, res) => {
  try {
    const newContact = new contactModel(req.body);
    await newContact.save();
    return res
      .status(201)
      .send({ success: true, message: "Form Submitted Successful" });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: `Add Contact ${error.message}`,
    });
  }
});

router.post("/get-user-query", authMiddleware, async (req, res) => {
  try {
    const queries = await contactModel.find({ email: req.body.email });
    if (queries.length === 0) {
      return res.status(201).send({
        success: false,
        message: "No Query Found",
      });
    }
    return res.status(200).send({
      success: true,
      message: "Query Fetched",
      data: queries,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

router.post("/update-query", authMiddleware, async (req, res) => {
  try {
    const query = await contactModel.findOne({ _id: req.body.id });
    if (!query) {
      return res.status(201).send({
        success: false,
        message: "No Query Found",
      });
    }
    query.msg.push({ msg: req.body.msg, person: req.body.person });
    const updateQuery = await query.save();
    if (!updateQuery) {
      return res.status(202).json({
        success: false,
        message: "Failed to update",
      });
    }
    return res.status(200).send({
      success: true,
      message: "Msg Sent Sucess",
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
