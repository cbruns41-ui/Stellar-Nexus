import { api } from "./api.js";
const token=location.hash.slice(1),status=document.querySelector("#approval-status"),login=document.querySelector("#approval-login"),button=document.querySelector("#approve-registration");
history.replaceState(null,"",location.pathname);
async function review() {
  if(!token) { status.textContent="Freigabelink fehlt. Öffne den Link aus der Admin-E-Mail.";return; }
  try {
    const row=await api("/registration/review",{method:"POST",body:{token}});
    status.textContent=`${row.username} (${row.email}) wartet auf deine Freigabe.`;
    login.hidden=true;button.hidden=row.status!=="pending";
  } catch(err) { status.textContent=err.message;login.hidden=false;button.hidden=true; }
}
login.onsubmit=async event=>{event.preventDefault();const submit=login.querySelector("button");submit.disabled=true;try{await api("/auth/login",{method:"POST",body:Object.fromEntries(new FormData(login))});await review();}catch(err){status.textContent=err.message;}finally{submit.disabled=false;}};
button.onclick=async()=>{button.disabled=true;try{const row=await api("/registration/approve",{method:"POST",body:{token}});status.textContent=`${row.username} ist freigegeben und kann sich jetzt anmelden.`;button.hidden=true;}catch(err){status.textContent=err.message;button.disabled=false;}};
review();
