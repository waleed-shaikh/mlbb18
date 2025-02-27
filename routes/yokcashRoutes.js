const express = require("express");
const axios = require("axios");
const paymentModel = require("../models/paymentModel");
const walletHistoryModel = require("../models/walletHistoryModel");
const orderModel = require("../models/orderModel");
const userModel = require("../models/userModel");
const fs = require("fs");
const nodemailer = require("nodemailer");
const browserMiddleware = require("../middlewares/browserMiddleware");

// Create an Express Router
const router = express.Router();

//? ================================== !! GET YOKCASH PRODUCT !! ===========================
router.post("/get-yokcash", async (req, res) => {
  try {
    const url = "https://a-api.yokcash.com/api/service";
    const params = new URLSearchParams();
    params.append("api_key", process.env.YOKCASH_API);
    const response = await fetch(url, {
      method: "POST",
      body: params,
    });
    const data = await response.json();
    const filteredGames = data.data.filter(
      (service) => service.kategori === req.body.gameName
    );
    return res.status(200).send({
      success: true,
      message: "Yokcash Services Fetched",
      data: filteredGames,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ status: false, msg: "Internal server error" });
  }
});

//? ================================== !! YOKCASH UPI ORDER !! ===========================
router.get("/check-yokcash-upi-order", browserMiddleware, async (req, res) => {
  try {
    const { orderId } = req.query;

    const existingOrder = await orderModel.findOne({
      client_txn_id: orderId,
    });

    if (existingOrder) {
      return res.redirect("https://ahongachao.in/user-dashboard");
    }

    const paymentResponse = await axios.post(
      "https://pay.onegateway.in/payment/status",
      {
        apiKey: process.env.ONEGATEWAY_API_KEY,
        orderId: orderId,
      }
    );

    // Check if the order ID is found
    if (paymentResponse.data.success) {
      const data = paymentResponse.data.data;
      if (data.status === "success") {
        const {
          orderId,
          paymentNote,
          customerName,
          customerEmail,
          customerNumber,
          amount,
          udf1,
          utr,
        } = data;

        const [userid, zoneid, productid, game] = paymentNote.split("%");

        const API_KEY = process.env.YOKCASH_API;
        const url = "https://a-api.yokcash.com/api/order";

        const params = new URLSearchParams();
        params.append("api_key", API_KEY);
        params.append("service_id", productid);
        params.append("target", `${userid}|${zoneid}`);
        params.append("kontak", customerNumber);
        params.append("idtrx", orderId);

        response = await fetch(url, {
          method: "POST",
          body: params,
        });

        const responseData = await response.json();

        if (!responseData.status) {
          return res
            .status(202)
            .send({ success: false, message: "Failed to Order" });
        }

        const paymentObject = {
          name: customerName,
          email: customerEmail,
          mobile: customerNumber,
          amount: amount,
          client_txn_id: orderId,
          status: data.status,
          upi_txn_id: utr,
        };

        const existingPayment = await paymentModel.findOne({
          upi_txn_id: utr,
        });

        if (!existingPayment) {
          const newPayment = new paymentModel(paymentObject);
          await newPayment.save();
        }

        const order = new orderModel({
          api: "yes",
          client_txn_id: orderId,
          p_info: game,
          amount: udf1,
          price: amount,
          customer_email: customerEmail,
          customer_mobile: customerNumber,
          playerId: userid,
          userId: userid,
          zoneId: zoneid,
          status: "success",
        });
        await order.save();

        //!send mail
        try {
          const dynamicData = {
            orderId: `${orderId}`,
            amount: `${udf1}`,
            price: `${amount}`,
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
              user: process.env.MAIL,
              pass: process.env.MAIL_PASS,
            },
          });
          let mailDetails = {
            from: process.env.MAIL,
            to: `${customerEmail}`,
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
        console.error("OrderID Not Found");
        return res.status(404).json({ error: "OrderID Not Found" });
      }
    }
  } catch (error) {
    console.error("Internal Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post(
  "/place-yokcash-from-wallet",
  browserMiddleware,
  async (req, res) => {
    try {
      const {
        order_id,
        txn_amount,
        product_name,
        customer_email,
        customer_mobile,
        txn_note,
      } = req.body;

      const checkUser = await userModel.findOne({ email: customer_email });
      if (checkUser?.balance < txn_amount || checkUser?.balance === 0) {
        return res
          .status(201)
          .send({ success: false, message: "Balance is less for this order" });
      }

      const existingOrder = await orderModel.findOne({
        client_txn_id: order_id,
        status: "success",
      });
      if (existingOrder) {
        return res.redirect("https://ahongachao.in/user-dashboard");
      }

      // const [userid, zoneid, productid, game] = paymentNote.split("%");
      const [userid, zoneid, productids, game] = txn_note.split("%");
      const productid = productids.split("&");
      const amount = product_name;

      const API_KEY = process.env.YOKCASH_API;
      const url = "https://a-api.yokcash.com/api/order";
      const params = new URLSearchParams();

      let response;
      for (let i = 0; i < productid.length; i++) {
        params.append("api_key", API_KEY);
        params.append("service_id", productid[i]);
        params.append("target", userid + "|" + zoneid);
        params.append("kontak", customer_mobile);
        params.append("idtrx", order_id);

        response = await fetch(url, {
          method: "POST",
          body: params,
        });
      }

      if (!response.status) {
        return res
          .status(202)
          .send({ success: false, message: "Failed to Order" });
      }

      if (response.status) {
        const order = new orderModel({
          api: "yes",
          amount: amount,
          client_txn_id: order_id,
          p_info: game,
          price: txn_amount,
          customer_email,
          customer_mobile,
          playerId: userid,
          userId: userid,
          zoneId: zoneid,
          status: "success",
        });
        await order.save();

        //! UPDATING BALANCE
        const user = await userModel.findOne({ email: customer_email });
        const balance =
          user?.balance - txn_amount < 0 ? 0 : user?.balance - txn_amount;
        if (user) {
          const updateBalance = await userModel.findOneAndUpdate(
            {
              email: customer_email,
            },
            {
              $set: {
                balance: balance,
              },
            },
            { new: true }
          );

          if (updateBalance) {
            //! WALLET HISTORY SAVE
            const history = new walletHistoryModel({
              orderId: order_id,
              email: customer_email,
              balanceBefore: user?.balance,
              balanceAfter:
                user?.balance - txn_amount < 0 ? 0 : user?.balance - txn_amount,
              price: txn_amount,
              p_info: product_name,
            });
            await history.save();

            return res
              .status(200)
              .send({ success: true, message: "Order Placed Successfully" });
          }
        }

        //!send mail
        try {
          const dynamicData = {
            orderId: `${order_id}`,
            amount: `${amount}`,
            price: `${txn_amount}`,
            p_info: `${product_name}`,
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
        console.error("Error placing order:", response.status.msg);
        return res.status(500).json({ error: "Error placing order" });
      }
    } catch (error) {
      console.error("Internal Server Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

module.exports = router;
