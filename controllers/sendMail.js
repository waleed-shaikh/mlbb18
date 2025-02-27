const nodemailer = require("nodemailer");

module.exports = async (email, subject, otp, msg) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      auth: {
        user: process.env.SENDING_EMAIL,
        pass: process.env.MAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SENDING_EMAIL, // sender address
      to: email, // list of receivers
      subject: subject, // Subject line
      text: `${msg} ${otp}`, // plain text body
      html: `${msg} <b>${otp}</b>`, // html body
    });
  } catch (error) {
    console.log("Email not sent");
    console.log(error);
  }
};
