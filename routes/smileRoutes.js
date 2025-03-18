const express = require("express");
const axios = require("axios");
const paymentModel = require("../models/paymentModel");
const productModel = require("../models/productModel");
const orderModel = require("../models/orderModel");
const userModel = require("../models/userModel");
const md5 = require("md5");
const querystring = require("querystring");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();
const nodemailer = require("nodemailer");
const browserMiddleware = require("../middlewares/browserMiddleware");
const fs = require("fs");
const generalRateLimiter = require("../middlewares/generalRateLimiter");

// barcode
router.post("/create", generalRateLimiter, browserMiddleware, authMiddleware, async (req, res) => {
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

    const pname = txn_note.split("@")[3];
    const amount = txn_note.split("@")[4];
    const product = await productModel.findOne({ name: pname });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    const priceExists = product.cost.some(
      (item) =>
        item.amount === amount &&
        (parseFloat(item.price) === parseFloat(txn_amount) ||
          parseFloat(item.resPrice) === parseFloat(txn_amount))
    );
    if (!priceExists) {
      return res.status(400).json({
        message: "Amount does not match",
      });
    }

    const existingOrder = await orderModel.findOne({ orderId: order_id });
    if (existingOrder) {
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
    // res.cookie("orderInProgress", true);
    return res.status(200).send({ success: true, data: response.data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.post("/status", generalRateLimiter, browserMiddleware, async (req, res) => {
  try {
    const { orderId } = req.query;

    const existingOrder = await orderModel.findOne({ orderId: orderId });
    if (existingOrder) {
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
        const {
          order_id,
          txn_note,
          customer_email,
          customer_mobile,
          txn_amount,
          product_name,
          utr_number,
          customer_name,
        } = transactionDetails;

        const [userid, zoneid, productids, pname, amount] = txn_note.split("@");
        const productid = productids.split("&");
        const region = product_name;

        //saving payment
        const paymentObject = {
          name: customer_name,
          email: customer_email,
          mobile: customer_mobile,
          amount: txn_amount,
          orderId: order_id,
          status: transactionDetails.status,
          utrNumber: utr_number,
        };
        const newPayment = new paymentModel(paymentObject);
        await newPayment.save();

        const uid = process.env.UID;
        const email = process.env.EMAIL;
        const product = "mobilelegends";
        const time = Math.floor(Date.now() / 1000);
        const mKey = process.env.KEY;

        let orderResponse;
        for (let i = 0; i < productid.length; i++) {
          const signArr = {
            uid,
            email,
            product,
            time,
            userid,
            zoneid,
            productid: productid[i],
          };
          const sortedSignArr = Object.fromEntries(
            Object.entries(signArr).sort()
          );
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
            productid: productid[i],
            time,
            sign,
          });
          const apiUrl =
            region === "brazil"
              ? "https://www.smile.one/br/smilecoin/api/createorder"
              : "https://www.smile.one/ph/smilecoin/api/createorder";
          orderResponse = await axios.post(apiUrl, formData, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
        }

        if (orderResponse?.data?.status === 200) {
          const order = new orderModel({
            api: "yes",
            orderDetails: amount,
            orderId: order_id,
            productinfo: pname,
            amount: txn_amount,
            email: customer_email,
            mobile: customer_mobile,
            userId: userid,
            zoneId: zoneid,
            status: "success",
          });
          await order.save();

          //!send mail
          try {
            const dynamicData = {
              orderId: `${order_id}`,
              amount: `${amount}`,
              price: `${txn_amount}`,
              p_info: `${pname}`,
              userId: `${userid}`,
              zoneId: `${zoneid}`,
            };
            let htmlContent = fs.readFileSync("order.html", "utf8");
            Object.keys(dynamicData).forEach((key) => {
              const placeholder = new RegExp(`{${key}}`, "g");
              htmlContent = htmlContent.replace(placeholder, dynamicData[key]);
            });
            // Send mail
            let mailTransporter = nodemailer.createTransport({
              service: "gmail",
              auth: {
                user: process.env.SENDING_EMAIL,
                pass: process.env.MAIL_PASS,
              },
            });
            let mailDetails = {
              from: process.env.SENDING_EMAIL,
              to: `${customer_email}`,
              subject: "Order Successful!",
              html: htmlContent,
            };
            mailTransporter.sendMail(mailDetails, function (err, data) {
              if (err) {
                console.log(err);
              }
            });
          } catch (error) {
            console.error("Error sending email:", error);
          }
          return res.redirect("https://ahongachao.in/user-dashboard");
        } else {
          console.error("Error placing order:", orderResponse?.data?.message);
          return res.status(500).json({ error: "Error placing order" });
        }
      } else {
        console.error("OrderID Not Found");
        return res.status(404).json({ error: "OrderID Not Found" });
      }
    }
  } catch (error) {
    console.error("Internal Server Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

//  wallet route
 router.post("/wallet", generalRateLimiter, browserMiddleware, authMiddleware, async (req, res) => {
   try {
     const {
       orderId,
       userid,
       zoneid,
       region,
       productid,
       customer_email,
       customer_mobile,
       amount,
       price,
       pname,
     } = req.body;

     if (
       !orderId ||
       !userid ||
       !zoneid ||
       !region ||
       !productid ||
       !customer_email ||
       !customer_mobile ||
       !amount ||
       !price ||
       !pname
     ) {
       return res
         .status(400)
         .send({ success: false, message: "Invalid Details" });
     }

     const existingOrder = await orderModel.findOne({
       orderId: orderId,
     });
     if (existingOrder) {
       return res
         .status(201)
         .send({ success: false, message: "Duplicate order exists" });
     }

     // price check
     const pp = await productModel.findOne({ name: pname });
     if (!pp) {
       return res.status(404).json({ message: "Product not found" });
     }

    //CROSS CHECK PACKAGE PRICE AND GAME ID
    const priceExists = pp.cost.some((item) => {
      const condition1 = item.amount === amount;
      const condition2 = Number(item.price) === Number(price) || Number(item.resPrice) === Number(price);
      const condition3 = item.id === productid;
  
      const finalCheck = condition1 && (condition2) && condition3;
  
      return finalCheck;
    });

    if (!priceExists) {
      return res.status(201).json({ message: "Amount does not match." });
    }

     const user = await userModel.findOne({ email: customer_email });
     if (!user) {
       return res
         .status(201)
         .send({ success: false, message: "Unauthorized access email" });
     }
     if (user?.balance < parseFloat(price) || user?.balance === 0) {
       return res
         .status(201)
         .send({ success: false, message: "Balance is less for this order" });
     }

     const newBalance = Math.max(0, user?.balance - parseFloat(price));
     const updateBalance = await userModel.findOneAndUpdate(
       {
         email: customer_email,
       },
       {
         $set: {
           balance: newBalance,
         },
       },
       { new: true }
     );
     if (!updateBalance) {
       return res
         .status(201)
         .send({ success: false, message: "Err updating balance" });
     }

     const uid = process.env.UID;
     const email = process.env.EMAIL;
     const product = "mobilelegends";
     const time = Math.floor(Date.now() / 1000);
     const mKey = process.env.KEY;
     const productId = productid.split("&");

     let orderResponse;
     for (let index = 0; index < productId.length; index++) {
       const signArr = {
         uid,
         email,
         product,
         time,
         userid,
         zoneid,
         productid: productId[index],
       };
       const sortedSignArr = Object.fromEntries(Object.entries(signArr).sort());
       const str =
         Object.keys(sortedSignArr)
           .map((key) => `${key}=${sortedSignArr[key]}`)
           .join("&") +
         "&" +
         mKey;
       const sign = md5(md5(str));
       //! CREATE ORDER
       const formData = querystring.stringify({
         email,
         uid,
         userid,
         zoneid,
         product,
         productid: productId[index],
         time,
        sign,
       });
       let apiUrl =
         region === "brazil"
           ? "https://www.smile.one/br/smilecoin/api/createorder"
           : "https://www.smile.one/ph/smilecoin/api/createorder";
       orderResponse = await axios.post(apiUrl, formData, {
         headers: {
           "Content-Type": "application/x-www-form-urlencoded",
         },
       });
     }

     if (orderResponse.data.status === 200) {
       const order = new orderModel({
         api: "yes",
         orderId: orderId,
         productinfo: pname,
         amount: price,
         orderDetails: amount,
         email: customer_email,
         mobile: customer_mobile,
         userId: userid,
         zoneId: zoneid,
         status: "success",
       });
       await order.save();
       try {
         const dynamicData = {
           orderId: `${orderId}`,
           amount: `${amount}`,
           price: `${price}`,
           p_info: `${pname}`,
           userId: `${userid}`,
           zoneId: `${zoneid}`,
         };
         let htmlContent = fs.readFileSync("order.html", "utf8");
         Object.keys(dynamicData).forEach((key) => {
           const placeholder = new RegExp(`{${key}}`, "g");
           htmlContent = htmlContent.replace(placeholder, dynamicData[key]);
         });
         // Send mail
         let mailTransporter = nodemailer.createTransport({
           service: "gmail",
           auth: {
             user: process.env.SENDING_EMAIL,
             pass: process.env.MAIL_PASS,
           },
         });
         let mailDetails = {
           from: process.env.SENDING_EMAIL,
           to: `${customer_email}`,
           subject: "Order Successful!",
           html: htmlContent,
         };
         mailTransporter.sendMail(mailDetails, function (err, data) {
           if (err) {
             console.log(err);
           }
         });
       } catch (error) {
         console.error("Error sending email:", error);
       }

       return res
         .status(200)
         .send({ success: true, message: "Order Placed Successfully" });
     } else {
       console.log("Failed:", orderResponse.data.message);
       return res
         .status(201)
         .send({ success: false, message: orderResponse.data.message });
     }
   } catch (smileOneError) {
     console.error("Error during Smile One order creation:", smileOneError);
     res.status(500).json({ error: "Error during Smile One order creation" });
   }
});

module.exports = router;
