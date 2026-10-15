export function setupFailure(error){
 const message=String(error?.message??'');
 const codes=[error?.code,error?.cause?.code,...(error?.cause?.errors??[]).map(e=>e?.code)];
 if(codes.includes('ECONNREFUSED'))return {code:'ORDERNEST_LOCAL_SERVER_UNAVAILABLE',message:'Serwer OrderNest jest wyłączony. Otwórz Uruchom-Test-Sandbox.cmd. Ten plik uruchomi aplikację i test w jednym oknie.'};
 if(codes.some(c=>['EACCES','EPERM'].includes(c)))return {code:'ORDERNEST_LOCAL_NETWORK_BLOCKED',message:'System zablokował lokalne połączenie. Nie zmieniaj zabezpieczeń. Zachowaj ten kod błędu do sprawdzenia.'};
 if(['TimeoutError','AbortError'].includes(error?.name))return {code:'ORDERNEST_CONNECTION_TIMEOUT',message:'Upłynął czas oczekiwania. Jeśli zamówienie ma już ID, zostanie użyte ponownie; nie twórz kolejnego ręcznie.'};
 if(message==='SANDBOX_SETUP_AUTH_HTTP_401')return {code:message,message:'PayPal odrzucił Client ID lub Secret. Skopiuj oba pola z TEJ SAMEJ aplikacji w zakładce Sandbox i uruchom Uruchom-Test-Sandbox.cmd ponownie. Zamówienie nie zostało utworzone.'};
 const safe=/^(SANDBOX_SETUP_[A-Z0-9_]+|ORDERNEST_[A-Z0-9_]+|PAYPAL_HTTP_\d{3})$/.test(message)?message:'ORDERNEST_SETUP_FAILED';
 return {code:safe,message:safe==='ORDERNEST_SANDBOX_NOT_RUNNING'?'Aplikacja nie ma połączenia Sandbox. Otwórz Uruchom-Test-Sandbox.cmd.':'Test nie został ukończony. Kluczy nie wpisuj do czatu; zachowaj wyświetlony kod błędu.'};
}
