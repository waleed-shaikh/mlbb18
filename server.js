const express = require("express");
const path = require("path");
const colors = require("colors");
const moragan = require("morgan");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");
var cors = require("cors");

// dotenv
dotenv.config();
connectDB();
const app = express();

//Trust Proxy Enable 
app.set("trust proxy", 1);
//Set up session middleware
app.use(
  session({
    secret: "NEOSTORE@#$123OFFICIAL",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 3 * 60 * 1000,
    },
  })
);

// middlewares
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(moragan("dev"));
app.use(express.static(path.join(__dirname, "public")));

// Static file for images
// PRODUCT
app.use(
  "/productImages",
  express.static(path.join(__dirname, "productImages"))
);

app.use("/", express.static("productImages"));
app.use("/admin-products", express.static("productImages"));
app.use("/admin-edit-product/:id", express.static("productImages"));
app.use("/admin-view-order/:id", express.static("productImages"));
app.use("/product/", express.static("productImages"));
app.use("/product/:name", express.static("productImages"));
//!
app.use("/gallery", express.static(path.join(__dirname, "gallery")));
app.use("/gallery", express.static("gallery"));
app.use("/product/:name", express.static("gallery"));
//!
app.use(
  "/notificationImages",
  express.static(path.join(__dirname, "notificationImages"))
);
// app.use("/gallery", express.static("gallery"));

// routes
app.use("/api/user/", require("./routes/userRoutes"));
app.use("/api/image/", require("./routes/imageUploadRoutes"));
app.use("/api/contact/", require("./routes/contactRoutes"));
app.use("/api/admin/", require("./routes/adminRoutes"));
app.use("/api/product/", require("./routes/productRoutes"));
app.use("/api/order/", require("./routes/orderRoutes"));
app.use("/api/noti/", require("./routes/notificationRoutes"));
app.use("/api/payment/", require("./routes/paymentRoutes"));
app.use("/api/smile/", require("./routes/smileRoutes"));
// app.use("/api/yokcash/", require("./routes/yokcashRoutes"));
// app.use("/api/image/", require("./routes/imageRoutes"));
// app.use("/api/otp/", require("./routes/otpRoutes"));
// app.use("/api/wallet/", require("./routes/walletHistoryRoutes"));

// PORT
const port = process.env.PORT || 8080;

// STATIC FILES RUNNING ON BUILD FOLDER
if (process.env.NODE_MODE === "production") {
  app.use(express.static(path.join(__dirname, "./client/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "./client/build/index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("API running..");
  });
}

// Listen
app.listen(port, (req, res) => {
  console.log(
    `Server running in ${process.env.NODE_MODE} Mode on Port ${process.env.PORT}`
      .bgCyan
  );
});
