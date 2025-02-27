const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "email is required"],
  },
  recharge: {
    type: String,
  },
  orderId: {
    type: String,
  },
  email: {
    type: String,
    required: [true, "email is required"],
  },
  mobile: {
    type: String,
  },
  p_info: {
    type: String,
  },
  status: {
    type: String,
  },
  upi_txn_id: {
    type: String,
  },
  created: {
    type: Date,
    default: Date.now(),
  },
});

const walletModel = mongoose.model("wallet", walletSchema);
module.exports = walletModel;
