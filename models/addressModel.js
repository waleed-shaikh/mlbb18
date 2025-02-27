const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  client_txn_id: {
    type: String,
  },
  ipAddress: {
    type: String,
  },
  latitude: {
    type: String,
  },
  longitude: {
    type: String,
  },
  address: {
    type: Array,
  },
});

const addressModel = mongoose.model("address", addressSchema);
module.exports = addressModel;
