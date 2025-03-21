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
const qs = require("qs");
const nodemailer = require("nodemailer");
const browserMiddleware = require("../middlewares/browserMiddleware");
const adminAuthMiddleware = require("../middlewares/adminAuthMiddleware");
const walletHistoryModel = require("../models/walletHistoryModel");
const generalRateLimiter = require("../middlewares/generalRateLimiter");

router.post("/get-role",  browserMiddleware, async (req, res) => {
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
router.post("/get-user-payments", authMiddleware, browserMiddleware, async (req, res) => {
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

//ADD WALLET MONEY BY EX_GATEWAY
router.post("/create-payment", generalRateLimiter, authMiddleware, async (req, res) => {
  try {
    const {
      order_id,
      txn_amount,
      product_name,
      customer_name,
      customer_email,
      customer_mobile
    } = req.body;

    const existingPayment = await paymentModel.findOne({
      orderId: order_id,
    });
    if (existingPayment) {
      return res.redirect("https://neostoreofficial.com/wallet");
    }

    const callbackUrl = `https://neostoreofficial.com/api/payment/check-status?orderId=${order_id}`;

    const payload = qs.stringify({
      customer_mobile: customer_mobile,
      user_token: process.env.EX_GATEWAY_API_TOKEN,
      amount: txn_amount,
      order_id: order_id,
      redirect_url: callbackUrl,
      remark1: product_name,
      remark2: `${customer_name}*${customer_email}*${customer_mobile}`,
    });

    const response = await axios.post("https://exgateway.com/api/create-order", payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.data && response.data.status === false) {
      return res
        .status(201)
        .send({ success: false, message: response.data.message });
    }
    return res.status(200).send({ success: true, data: response.data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/check-status", generalRateLimiter, async (req, res) => {
  try {
    const {orderId} = req.query;
    console.log(orderId)
    const existingPayment = await paymentModel.findOne({
      orderId: orderId,
    });
    if (existingPayment) {
      return res.redirect("https://neostoreofficial.com/wallet");
    }
    const payload = qs.stringify({
      user_token: process.env.EX_GATEWAY_API_TOKEN,
      order_id: orderId
    });

    const orderStatusResponse = await axios.post("https://exgateway.com/api/check-order-status", payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log(orderStatusResponse.data)

    if (orderStatusResponse.data.status) {
      const transactionDetails = orderStatusResponse.data.result;
      if (transactionDetails.txnStatus === 'SUCCESS') {
        const {
          orderId: order_id,
          utr: utr_number,
          amount: txn_amount,
          remark1,
          remark2
        } = transactionDetails;

        if (
          !order_id ||
          !utr_number ||
          !remark2
        ) {
          console.log("parameter missing")
          return res.redirect("https://neostoreofficial.com/wallet");
        }

        const [customer_name, customer_email, customer_mobile] = remark2.split("*");

        // saving payment
        const paymentObject = {
          name: customer_name,
          email: customer_email,
          mobile: customer_mobile,
          amount: txn_amount,
          orderId: order_id,
          status: transactionDetails.txnStatus,
          upi_txn_id: utr_number,
          type: "Wallet Topup",
        };
        const newPayment = new paymentModel(paymentObject);
        await newPayment.save();

        const user = await userModel.findOne({
          email: customer_email,
        });

        if(!user){
          return res.status(201).send({ success: false, message: "user not found" });
        }

        // Prepare balance update
        const newBalance = parseFloat(user.balance) + parseFloat(txn_amount);

        const updatedUser = await userModel.findOneAndUpdate(
          { email: customer_email },
          {
            $set: {
              balance: newBalance,
            },
          },
          { new: true }
        );

        // Prepare wallet history data
        const historyData = {
          orderId: order_id,
          email: customer_email,
          balanceBefore: user?.balance,
          balanceAfter: newBalance,
          price: `+${txn_amount}`,
          p_info: remark1,
          type: "addmoney",
        };

        // Save history
        const history = new walletHistoryModel(historyData);
        await history.save();

        if (updatedUser) {
          return res.redirect(`https://neostoreofficial.com/wallet`);
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
