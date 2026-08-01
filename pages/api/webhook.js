export default async function handler(req, res) {
  const { url } = req.body; // ❗ YE LINE MUST HAI

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "Triggered from Autovance AI 🚀"
      })
    });

    const data = await response.text();

    res.status(200).json({
      result: data || "Webhook triggered successfully!"
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      error: "Webhook failed"
    });
  }
}