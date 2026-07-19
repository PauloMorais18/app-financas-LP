import app from "./server.js";

const port=Number(process.env.PORT||3333);
app.listen(port,()=>console.log(`API financeira em http://localhost:${port}`));
