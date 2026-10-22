(() => {
  const $ = id => document.getElementById(id);
  const url = window.NUTRIVANCE_SUPABASE_URL || "";
  const key = window.NUTRIVANCE_SUPABASE_ANON_KEY || "";
  const configured = url.startsWith("https://") && !url.includes("YOUR_") && key && !key.includes("YOUR_");
  let client = null, currentUser = null, articles = [], selectedImageUrl = "";
  const say = (id, message) => { const el=$(id); if(el) el.textContent=message; };
  const show = (id, visible) => $(id).classList.toggle("admin-hidden", !visible);
  const slugify = text => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const safeDateInput = value => {
    if(!value) return "";
    const d = new Date(value); if(Number.isNaN(d.getTime())) return "";
    const local = new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  };
  if(!configured || !window.supabase) {
    say("login-status", "Backend not connected yet. Follow ADMIN-SETUP-GUIDE.txt to create Supabase and configure admin-config.js.");
    $("login-form").addEventListener("submit", e=>{e.preventDefault();say("login-status","Please complete the Supabase setup first. See ADMIN-SETUP-GUIDE.txt.");});
    $("reset-password").addEventListener("click",()=>say("login-status","Complete the Supabase setup first, then use password reset."));
    return;
  }
  client = window.supabase.createClient(url,key);
  async function checkSession() {
    const {data,error}=await client.auth.getSession();
    if(error) {say("login-status",error.message);return;}
    if(data.session) await applySession(data.session.user);
  }
  async function applySession(user) {
    if(!user) return;
    if((user.email||"").toLowerCase() !== (window.NUTRIVANCE_ADMIN_EMAIL||"").toLowerCase()) {
      await client.auth.signOut();
      say("login-status","This account is not authorised as the NutriVance administrator.");
      return;
    }
    currentUser=user; show("login-panel",false);show("dashboard-panel",true);show("signout",true);
    await loadArticles(); await loadMedia();
  }
  $("login-form").addEventListener("submit", async e=>{
    e.preventDefault(); say("login-status","Signing in…");
    const email=$("login-email").value.trim().toLowerCase(), password=$("login-password").value;
    if(email !== (window.NUTRIVANCE_ADMIN_EMAIL||"").toLowerCase()){say("login-status","Use the authorised administrator email: "+window.NUTRIVANCE_ADMIN_EMAIL);return;}
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error){say("login-status",error.message);return;} await applySession(data.user);
  });
  $("reset-password").addEventListener("click", async ()=>{
    const email=$("login-email").value.trim().toLowerCase();
    if(email !== (window.NUTRIVANCE_ADMIN_EMAIL||"").toLowerCase()){say("login-status","Enter the authorised administrator email first.");return;}
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    say("login-status",error ? error.message : "If the account exists, a password-reset email has been sent. Check your inbox and spam folder.");
  });
  $("signout").addEventListener("click",async()=>{await client.auth.signOut();location.reload();});
  $("article-title").addEventListener("input",()=>{if(!$("article-id").value || !$("article-slug").dataset.touched) $("article-slug").value=slugify($("article-title").value);});
  $("article-slug").addEventListener("input",()=>{$("article-slug").dataset.touched="1";});
  $("article-image").addEventListener("change",()=>{
    const f=$("article-image").files[0], preview=$("image-preview");
    if(f){if(!f.type.startsWith("image/")){say("editor-status","Please choose an image file.");return;}preview.src=URL.createObjectURL(f);show("image-preview",true);}
    else show("image-preview",false);
  });
  $("clear-editor").addEventListener("click",clearEditor);
  function clearEditor(){ $("article-form").reset();$("article-id").value="";$("article-slug").dataset.touched="";$("editor-title").textContent="Create an article";$("image-preview").src="";show("image-preview",false);selectedImageUrl="";say("editor-status",""); }
  $("article-form").addEventListener("submit",async e=>{
    e.preventDefault();if(!currentUser){say("editor-status","Please sign in again.");return;}
    const btn=$("article-form").querySelector('button[type="submit"]');btn.disabled=true;say("editor-status","Saving article…");
    try{
      let imageUrl=selectedImageUrl || null;
      const file=$("article-image").files[0];
      if(file){
        if(file.size>8*1024*1024) throw new Error("Please use an image smaller than 8 MB.");
        const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
        const path=currentUser.id+"/"+crypto.randomUUID()+"."+ext;
        const {error:upErr}=await client.storage.from("nutrivance-media").upload(path,file,{upsert:false,contentType:file.type});
        if(upErr) throw upErr;
        const {data:pub}=client.storage.from("nutrivance-media").getPublicUrl(path);
        imageUrl=pub.publicUrl;
      }
      const published=$("publish-now").checked;
      const publishAt=$("publish-date").value ? new Date($("publish-date").value).toISOString() : new Date().toISOString();
      const record={title:$("article-title").value.trim(),slug:$("article-slug").value.trim(),summary:$("article-summary").value.trim(),body:$("article-body").value.trim(),category:$("article-category").value,status:published?"published":"draft",published_at:published?publishAt:null,image_url:imageUrl,updated_at:new Date().toISOString(),author_id:currentUser.id};
      if(!record.slug) throw new Error("Please add a URL slug.");
      const id=$("article-id").value;
      let result;
      if(id) result=await client.from("articles").update(record).eq("id",id).select().single();
      else result=await client.from("articles").insert(record).select().single();
      if(result.error) throw result.error;
      selectedImageUrl=imageUrl||"";say("editor-status",published?"Article saved as published.":"Draft saved.");clearEditor();await loadArticles();await loadMedia();
    }catch(err){say("editor-status","Could not save: "+(err.message||String(err)));}
    finally{btn.disabled=false;}
  });
  async function loadArticles(){
    say("list-status","Loading articles…");
    const {data,error}=await client.from("articles").select("*").order("updated_at",{ascending:false});
    if(error){say("list-status",error.message);return;}
    articles=data||[];say("list-status",articles.length+" article(s).");
    const list=$("article-list");list.replaceChildren();
    if(!articles.length){list.textContent="No articles yet. Create your first article using the form.";return;}
    articles.forEach(a=>{
      const item=document.createElement("article");item.className="admin-item";
      const info=document.createElement("div");const title=document.createElement("strong");title.textContent=a.title;
      const meta=document.createElement("p");meta.textContent=(a.status||"draft").toUpperCase()+" · "+(a.category||"Uncategorised")+(a.published_at?" · "+new Date(a.published_at).toLocaleDateString():"");
      const summary=document.createElement("p");summary.textContent=a.summary||"";
      info.append(title,meta,summary);
      const actions=document.createElement("div");actions.className="admin-item-actions";
      const edit=document.createElement("button");edit.className="admin-btn secondary";edit.textContent="Edit";edit.onclick=()=>editArticle(a);
      const pub=document.createElement("button");pub.className="admin-btn secondary";pub.textContent=a.status==="published"?"Unpublish":"Publish";pub.onclick=()=>togglePublish(a);
      const del=document.createElement("button");del.className="admin-btn danger";del.textContent="Delete";del.onclick=()=>deleteArticle(a);
      actions.append(edit,pub,del);item.append(info,actions);list.append(item);
    });
  }
  function editArticle(a){
    $("article-id").value=a.id;$("article-title").value=a.title||"";$("article-slug").value=a.slug||"";$("article-slug").dataset.touched="1";
    $("article-summary").value=a.summary||"";$("article-body").value=a.body||"";$("article-category").value=a.category||"Nutrition";
    $("publish-date").value=safeDateInput(a.published_at);$("publish-now").checked=a.status==="published";
    selectedImageUrl=a.image_url||"";if(a.image_url){$("image-preview").src=a.image_url;show("image-preview",true);}else show("image-preview",false);
    $("editor-title").textContent="Edit article";say("editor-status","Editing: "+a.title);window.scrollTo({top:0,behavior:"smooth"});
  }
  async function togglePublish(a){
    const publish=a.status!=="published";
    const patch={status:publish?"published":"draft",published_at:publish?(a.published_at||new Date().toISOString()):null,updated_at:new Date().toISOString()};
    const {error}=await client.from("articles").update(patch).eq("id",a.id);
    if(error){say("list-status",error.message);return;}await loadArticles();
  }
  async function deleteArticle(a){
    if(!confirm('Delete "'+a.title+'" permanently?'))return;
    const {error}=await client.from("articles").delete().eq("id",a.id);
    if(error){say("list-status",error.message);return;}await loadArticles();
  }
  async function loadMedia(){
    const {data,error}=await client.storage.from("nutrivance-media").list(currentUser.id,{limit:60,sortBy:{column:"created_at",order:"desc"}});
    const list=$("media-list");list.replaceChildren();
    if(error){list.textContent=error.message;return;}
    if(!data||!data.length){list.textContent="No uploaded images yet.";return;}
    data.forEach(file=>{
      const path=currentUser.id+"/"+file.name, {data:pub}=client.storage.from("nutrivance-media").getPublicUrl(path);
      const item=document.createElement("div");item.className="admin-item";
      const img=document.createElement("img");img.src=pub.publicUrl;img.alt=file.name;img.style.cssText="width:78px;height:65px;object-fit:cover;border-radius:4px";
      const name=document.createElement("div");name.style.flex="1";const strong=document.createElement("strong");strong.textContent=file.name;const small=document.createElement("p");small.textContent=file.created_at?new Date(file.created_at).toLocaleDateString():"Uploaded image";name.append(strong,small);
      const del=document.createElement("button");del.className="admin-btn danger";del.textContent="Delete";del.onclick=async()=>{if(!confirm("Delete this image? It may disappear from any article using it."))return;const {error}=await client.storage.from("nutrivance-media").remove([path]);say("list-status",error?error.message:"Image deleted.");await loadMedia();};
      item.append(img,name,del);list.append(item);
    });
  }
  $("refresh-articles").addEventListener("click",loadArticles);
  client.auth.onAuthStateChange((_event,session)=>{if(session && !currentUser) applySession(session.user);});
  checkSession();
})();