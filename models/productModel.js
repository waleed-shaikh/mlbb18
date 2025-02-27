const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Product name is required"],
  },
  image: {
    type: String,
  },
  cost: {
    type: Array,
    required: [true, "Product price is required"],
  },
  desc: {
    type: String,
  },
  category: {
    type: String,
  },
  api: {
    type: String,
    default: "no",
  },
  apiName: {
    type: String,
  },
  region: {
    type: String,
    default: "none",
  },
  stock: {
    type: String,
    default: "none",
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
});

const productModel = mongoose.model("product", productSchema);
module.exports = productModel;
