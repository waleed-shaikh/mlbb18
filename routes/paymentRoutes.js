const express = require("express");
const axios = require("axios");
const paymentModel = require("../models/paymentModel");
const productModel = require("../models/productModel");
const orderModel = require("../models/orderModel");
const userModel = require("../models/userModel");
const sendMail = require("../controllers/sendMail");
const md5 = require("md5");
const querystring = require("querystring");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();
const cookieParser = require("cookie-parser");
const session = require("express-session");
const fs = require("fs");
const nodemailer = require("nodemailer");
const browserMiddleware = require("../middlewares/browserMiddleware");
const adminAuthMiddleware = require("../middlewares/adminAuthMiddleware");

router.post("/get-role", browserMiddleware, async (req, res) => {
  try {
    const { userid, zoneid, productid, region } = req.body;
    const uid = process.env.UID;
    const email = process.env.EMAIL;
    const product = "mobilelegends";
    const time = Math.floor(Date.now() / 1000);
    const mKey = process.env.KEY;
    // GENERATING SIGN
    const signArr = {
      uid,
      email,
      product,
      time,
      userid,
      zoneid,
      productid,
    };
    const sortedSignArr = Object.fromEntries(Object.entries(signArr).sort());
    const str =
      Object.keys(sortedSignArr)
        .map((key) => `${key}=${sortedSignArr[key]}`)
        .join("&") +
      "&" +
      mKey;
    const sign = md5(md5(str));
    const formData = querystring.stringify({
      email,
      uid,
      userid,
      zoneid,
      product,
      productid,
      time,
      sign,
    });
    let apiUrl =
      region === "brazil"
        ? "https://www.smile.one/br/smilecoin/api/getrole"
        : "https://www.smile.one/ph/smilecoin/api/getrole";
    let role;
    role = await axios.post(apiUrl, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    if (role.data.status === 200) {
      return res.status(200).send({
        success: true,
        username: role.data.username,
        zone: role.data.zone,
        message: role.data.message,
      });
    } else {
      return res
        .status(201)
        .send({ success: false, message: role.data.message });
    }
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
});
router.post("/get-user-payments", browserMiddleware, async (req, res) => {
  try {
    const payments = await paymentModel.find({ email: req.body.email });
    if (payments.length === 0) {
      return res
        .status(201)
        .send({ success: true, message: "No Payment Found" });
    }
    return res.status(200).send({
      success: true,
      message: "Payment Fetched successfully",
      data: payments,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});
router.get("/get-all-payments", adminAuthMiddleware, async (req, res) => {
  try {
    const payments = await paymentModel.find({});
    if (payments.length === 0) {
      return res
        .status(201)
        .send({ success: true, message: "No Payment Found" });
    }
    return res.status(200).send({
      success: true,
      message: "Payment Fetched successfully",
      data: payments,
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

router.post("/addmoney", authMiddleware, async (req, res) => {
  try {
    const {
      order_id,
      txn_amount,
      txn_note,
      product_name,
      customer_name,
      customer_email,
      customer_mobile,
      callback_url,
    } = req.body;

    if (parseInt(txn_amount) > 2000) {
      return res.redirect("https://ahongachao.in/user-dashboard");
    }

    const existingPayment = await paymentModel.findOne({ orderId: order_id });
    if (existingPayment) {
      return res.redirect("https://ahongachao.in/user-dashboard");
    }

    const response = await axios.post("https://pgateway.in/order/create", {
      token: process.env.API_TOKEN,
      order_id,
      txn_amount,
      txn_note,
      product_name,
      customer_name,
      customer_email,
      customer_mobile,
      callback_url,
    });

    if (response.data && response.data.status === false) {
      console.log(response.data);
      return res
        .status(201)
        .send({ success: false, message: res.data.message });
    }
    return res.status(200).send({ success: true, data: response.data });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error });
  }
});
router.post("/status", async (req, res) => {
  try {
    const { orderId } = req.query;

    const existingPayment = await paymentModel.findOne({ orderId: orderId });
    if (existingPayment) {
      return res.redirect("https://ahongachao.in/user-dashboard");
    }

    const orderStatusResponse = await axios.post(
      "https://pgateway.in/order/status",
      {
        token: process.env.API_TOKEN,
        order_id: orderId,
      }
    );

    // Check if the order ID is found
    if (orderStatusResponse.data.status) {
      const transactionDetails = orderStatusResponse.data.results;
      if (transactionDetails.status === "Success") {
        if (parseInt(transactionDetails.txn_amount) > 2000) {
          return res.redirect("https://ahongachao.in/user-dashboard");
        }

        const paymentObject = {
          name: transactionDetails.customer_name,
          email: transactionDetails.customer_email,
          amount: transactionDetails.txn_amount,
          mobile: transactionDetails.customer_mobile,
          orderId: transactionDetails.order_id,
          status: transactionDetails.status,
          utrNumber: transactionDetails.utr_number,
        };
        // Save payment details to the database
        const existingPayment = await paymentModel.findOne({
          utrNumber: transactionDetails.utr_number,
        });

        if (!existingPayment) {
          const newPayment = new paymentModel(paymentObject);
          await newPayment.save();
          // Update user balance
          const user = await userModel.findOne({
            email: transactionDetails.customer_email,
          });
          if (user) {
            const updatedUser = await userModel.findOneAndUpdate(
              { email: transactionDetails.customer_email },
              {
                $set: {
                  balance: user.balance + transactionDetails.txn_amount,
                },
              },
              { new: true }
            );
            if (updatedUser) {
              return res.redirect("https://ahongachao.in/user-dashboard");
            }
          }
        }
      }
    } else {
      console.error("OrderID Not Found");
      return res.status(404).json({ error: "OrderID Not Found" });
    }
  } catch (error) {
    console.error("Internal Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// manual
// router.post("/create-manual-upi-order", authMiddleware, async (req, res) => {
//   try {
//     const {
//       order_id,
//       txn_amount,
//       txn_note,
//       product_name,
//       customer_name,
//       customer_email,
//       customer_mobile,
//       callback_url,
//     } = req.body;

//     const existingOrder = await orderModel.findOne({ orderId: order_id });
//     if (existingOrder) {
//       return res.redirect("https://ahongachao.in/user-dashboard");
//     }

//     const response = await axios.post("https://pgateway.in/order/create", {
//       token: process.env.API_TOKEN,
//       order_id,
//       txn_amount,
//       txn_note,
//       product_name,
//       customer_name,
//       customer_email,
//       customer_mobile,
//       callback_url,
//     });

//     if (response.data && response.data.status === false) {
//       return res
//         .status(201)
//         .send({ success: false, message: res.data.message });
//     }
//     // res.cookie("orderInProgress", true);
//     return res.status(200).send({ success: true, data: response.data });
//   } catch (error) {
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });
// router.post("/check-manual-upi-order", browserMiddleware, async (req, res) => {
//   try {
//     const { orderId } = req.query;

//     const existingOrder = await orderModel.findOne({ orderId: orderId });
//     if (existingOrder) {
//       return res.redirect("https://ahongachao.in/user-dashboard");
//     }

//     const orderStatusResponse = await axios.post(
//       "https://pgateway.in/order/status",
//       {
//         token: process.env.API_TOKEN,
//         order_id: orderId,
//       }
//     );

//     if (orderStatusResponse.data.status) {
//       const transactionDetails = orderStatusResponse.data.results;
//       if (transactionDetails.status === "Success") {
//         const {
//           order_id,
//           txn_note,
//           customer_email,
//           customer_mobile,
//           txn_amount,
//           product_name,
//         } = transactionDetails;

//         const userid = txn_note.split("@")[0];
//         const amount = txn_note.split("@")[1];
//         const zoneid = "none";
//         //! PLACE ORDER
//         const existOrder = await orderModel.findOne({ orderId: order_id });
//         if (!existOrder) {
//           const order = new orderModel({
//             api: "no",
//             orderId: order_id,
//             productinfo: product_name,
//             amount: txn_amount,
//             orderDetails: amount,
//             email: customer_email,
//             mobile: customer_mobile,
//             userId: userid,
//             zoneId: zoneid,
//             status: "pending",
//           });
//           await order.save();

//           //! SEND EMAIL TO USER
//           try {
//             const dynamicData = {
//               orderId: `${order_id}`,
//               amount: `${amount}`,
//               price: `${txn_amount}`,
//               p_info: `${product_name}`,
//               userId: `${userid}`,
//               zoneId: "none",
//             };
//             let htmlContent = fs.readFileSync("order.html", "utf8");
//             Object.keys(dynamicData).forEach((key) => {
//               const placeholder = new RegExp(`{${key}}`, "g");
//               htmlContent = htmlContent.replace(placeholder, dynamicData[key]);
//             });
//             // Send mail
//             let mailTransporter = nodemailer.createTransport({
//               service: "gmail",
//               auth: {
//                 user: process.env.SENDING_EMAIL,
//                 pass: process.env.MAIL_PASS,
//               },
//             });
//             let mailDetails = {
//               from: process.env.SENDING_EMAIL,
//               to: `${customer_email}`,
//               subject: "Order Successful!",
//               html: htmlContent,
//             };
//             mailTransporter.sendMail(mailDetails, function (err, data) {
//               if (err) {
//                 console.log(err);
//               }
//             });
//           } catch (error) {
//             console.error("Error sending email:", error);
//           }

//           //! SENDING MAIL TO ADMIN
//           const sub = "New Order Recieved";
//           const msgg =
//             "Hello Admin! You have received a new order. Kindly login to see your order.";
//           await sendMail("69venom.store@gmail.com", sub, "", msgg);
//         }
//         return res.redirect(`https://ahongachao.in/user-dashboard/`);
//       }
//     }
//   } catch (error) {
//     console.error("Internal Server Error:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });
// router.post("/place-order-non-api", authMiddleware, async (req, res) => {
//   try {
//     const {
//       api,
//       orderId,
//       userid,
//       customer_email,
//       customer_mobile,
//       pname,
//       amount,
//       price,
//     } = req.body;

//     if (
//       !api ||
//       !orderId ||
//       !userid ||
//       !customer_email ||
//       !customer_mobile ||
//       !pname ||
//       !amount ||
//       !price
//     ) {
//       return res
//         .status(400)
//         .send({ success: false, message: "Invalid Details" });
//     }

//     const checkUser = userModel.findOne({ email: customer_email });
//     if (checkUser?.balance < price || checkUser?.balance === 0) {
//       return res
//         .status(201)
//         .send({ success: false, message: "Balance is less for this order" });
//     }

//     const orderExist = await orderModel.findOne({ orderId: orderId });
//     if (orderExist) {
//       return res
//         .status(200)
//         .send({ success: false, message: "Order already exist" });
//     }

//     const newOrder = new orderModel({
//       api: api,
//       orderId: orderId,
//       orderDetails: amount,
//       amount: price,
//       email: customer_email,
//       mobile: customer_mobile,
//       productinfo: pname,
//       userId: userid,
//     });
//     await newOrder.save();

//     //! SEND EMAIL TO USER
//     try {
//       const dynamicData = {
//         orderId: `${orderId}`,
//         amount: `${amount}`,
//         price: `${price}`,
//         p_info: `${pname}`,
//         userId: `${userid}`,
//         zoneId: "none",
//       };
//       let htmlContent = fs.readFileSync("order.html", "utf8");
//       Object.keys(dynamicData).forEach((key) => {
//         const placeholder = new RegExp(`{${key}}`, "g");
//         htmlContent = htmlContent.replace(placeholder, dynamicData[key]);
//       });
//       // Send mail
//       let mailTransporter = nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//           user: process.env.SENDING_EMAIL,
//           pass: process.env.MAIL_PASS,
//         },
//       });
//       let mailDetails = {
//         from: process.env.SENDING_EMAIL,
//         to: `${customer_email}`,
//         subject: "Order Successful!",
//         html: htmlContent,
//       };
//       mailTransporter.sendMail(mailDetails, function (err, data) {
//         if (err) {
//           console.log(err);
//         }
//       });
//     } catch (error) {
//       console.error("Error sending email:", error);
//     }

//     //! SENDING MAIL TO ADMIN
//     const sub = "New Order Recieved";
//     const msgg =
//       "Hello Admin! You have received a new order. Kindly login to see your order.";
//     await sendMail("69venom.store@gmail.com", sub, "", msgg);

//     const user = await userModel.findOne({ email: customer_email });
//     if (user) {
//       const updateUser = await userModel.findOneAndUpdate(
//         {
//           email: customer_email,
//         },
//         {
//           $set: {
//             balance: user?.balance - price < 0 ? 0 : user?.balance - price,
//           },
//         },
//         { new: true }
//       );

//       if (updateUser) {
//         //! WALLET HISTORY SAVE
//         // const history = new walletHistoryModel({
//         //   orderId: client_txn_id,
//         //   email: customer_email,
//         //   balanceBefore: user?.balance,
//         //   balanceAfter: user?.balance - price < 0 ? 0 : user?.balance - price,
//         //   price: price,
//         //   p_info: pname,
//         // });
//         // await history.save();

//         return res
//           .status(201)
//           .send({ success: true, message: "Order Placed Success" });
//       }
//     }
//   } catch (error) {
//     return res.status(500).send({ success: false, message: error.message });
//   }
// });

module.exports = router;
