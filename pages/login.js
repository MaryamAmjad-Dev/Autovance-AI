import { useState } from "react";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    alert("Login Successful 🚀");
  };

  return (
    <div style={{
      height:"100vh",
      display:"flex",
      justifyContent:"center",
      alignItems:"center",
      background:"#0f172a",
      color:"white"
    }}>

      <div style={{
        background:"#1e293b",
        padding:30,
        borderRadius:10,
        width:300
      }}>
        <h2>🔐 Autovance AI Login</h2>

        <input
          placeholder="Email"
          onChange={(e)=>setEmail(e.target.value)}
          style={{width:"100%", marginBottom:10, padding:8}}
        />

        <input
          type="password"
          placeholder="Password"
          onChange={(e)=>setPassword(e.target.value)}
          style={{width:"100%", marginBottom:10, padding:8}}
        />

        <button onClick={handleLogin} style={{
          width:"100%",
          padding:10,
          background:"#22c55e",
          border:"none",
          borderRadius:5
        }}>
          Login
        </button>

        <p style={{marginTop:10}}>
          Don't have account? <Link href="/signup">Signup</Link>
        </p>
      </div>

    </div>
  );
}