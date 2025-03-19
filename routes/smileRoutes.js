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
const qs = require("qs");
const generalRateLimiter = require("../middlewares/generalRateLimiter");

// barcode
router.post("/create", generalRateLimiter, browserMiddleware, authMiddleware, async (req, res) => {
  try {
    const {
      order_id,
      txn_note
    } = req.body;

    // ✅ Validate required fields
    if (!order_id || !txn_note) {
      return res.status(404).json({ success: false, message: "Missing required fields" });
    }
    const [userId, zoneId, productId, pname, amount, selectedPrice, customer_name, customer_email, customer_mobile, region] = (txn_note || "").split("*");

    // Validate Product
    const checkProduct = await productModel.findOne({ name: pname });
    if (!checkProduct) {
      return res.status(201).json({ message: "Product not found" });
    }

    //CROSS CHECK PACKAGE PRICE AND GAME ID
    const priceExists = checkProduct.cost.some(
      (item) =>
        item.amount === amount &&
        (Number(item.price) === Number(selectedPrice) || (Number(item.resPrice) === Number(selectedPrice) && item.id === productId))
    );

    if (!priceExists) {
      return res.status(201).json({ message: "Amount does not match." });
    }

    const existingOrder = await orderModel.findOne({ orderId: order_id });
    if (existingOrder) {
      return res.redirect("https://neostoreofficial.com/user-dashboard");
    }
    

    const callbackUrl = `https://neostoreofficial.com/api/smile/check-status?orderId=${order_id}`;

    const payload = qs.stringify({
      customer_mobile: customer_mobile,
      user_token: process.env.EX_GATEWAY_API_TOKEN,
      amount: "1",
      order_id: order_id,
      redirect_url: callbackUrl,
      remark1: `${pname}@${amount}@${selectedPrice}rs`,
      remark2: txn_note,
    });

    const response = await axios.post("https://exgateway.com/api/create-order", payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.data && response.data.status === false) {
      console.log(response.data);
      return res
        .status(201)
        .send({ success: false, message: response.data.message });
    }
    // res.cookie("orderInProgress", true);
    return res.status(200).send({ success: true, data: response.data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/check-status", generalRateLimiter, browserMiddleware, async (req, res) => {
  try {
    const { orderId } = req.query;

    console.log(orderId)

    const existingOrder = await orderModel.findOne({
      orderId: orderId,
    }); 
    if (existingOrder) {
      return res.status(201).json({ success: false, message: `Your order is already exist and found with ${existingOrder?.status} status`});
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
    
    // Check if the order ID is found
    if (orderStatusResponse.data.status) {
      const transactionDetails = orderStatusResponse.data.result;
      if (transactionDetails.txnStatus === 'SUCCESS') {
        const {
          orderId: order_id,
          utr: utr_number,
          amount: price,
          remark2
        } = transactionDetails;

        if (
          !order_id ||
          !price ||
          !remark2 ||
          !utr_number
        ) {
          console.log("parameter missing")
          return res.redirect("https://neostoreofficial.com/user-dashboard");
        }

        const [userid, zoneid, productids, pname, amount, selectedPrice, customer_name, customer_email, customer_mobile, region] = remark2.split("*");
        console.log(userid)
        console.log(zoneid)
        console.log(productids)
        console.log(pname)
        console.log(amount)
        console.log(selectedPrice)
        console.log(customer_name)
        console.log(customer_email)
        console.log(customer_mobile)
        console.log(region)
        const productid = productids.split("&");

        /// saving payment
        const paymentObject = {
          name: customer_name,
          email: customer_email,
          mobile: customer_mobile,
          amount: price,
          orderId: order_id,
          status: transactionDetails.txnStatus,
          upi_txn_id: utr_number,
          type: "order",
        };
        const newPayment = new paymentModel(paymentObject);
        await newPayment.save();

        // Validate Product
        const checkProduct = await productModel.findOne({ name: pname });
        if (!checkProduct) {
          return res.status(201).json({ message: "Product not found" });
        }

        //CROSS CHECK PACKAGE PRICE AND GAME ID
        const priceExists = checkProduct.cost.some(
          (item) =>
            item.amount === amount &&
            (Number(item.price) === Number(selectedPrice) || (Number(item.resPrice) === Number(selectedPrice) && item.id === productids))
        );

        if (!priceExists) {
          return res.status(201).json({ message: "Amount does not match." });
        }

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
            amount: amount,
            orderId: order_id,
            productinfo: pname,
            price: price,
            email: customer_email,
            mobile: customer_mobile,
            userId: userid,
            zoneId: zoneid,
            status: "success",
            paymentMode: "UPI",
          });
          await order.save();

          //!send mail
          try {
            const dynamicData = {
              orderId: `${order_id}`,
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
          return res.redirect("https://neostoreofficial.com/user-dashboard");
        } else {
          const order = new orderModel({
            api: "yes",
            amount: amount,
            orderId: order_id,
            productinfo: pname,
            price: price,
            customer_email,
            customer_mobile,
            userId: userid,
            zoneId: zoneid,
            status: "failed",
            paymentMode: "UPI",
          });
          await order.save();
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
         price: price,
         amount: amount,
         email: customer_email,
         mobile: customer_mobile,
         userId: userid,
         zoneId: zoneid,
         status: "success",
         paymentMode: "WALLET",
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
