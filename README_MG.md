# Olivier AI — Facebook Messenger Bot

Bot antsoina hoe **Olivier AI** ho an'ny **Facebook Page**, mampiasa Groq API. Tsy mampiasa xAI/Grok API izy. Rehefa anontanian'ny olona ny anarany dia mamaly hoe Olivier.

## Ilaina
- Node.js 18.17 na vaovao kokoa
- Facebook Page sy Meta app misy Messenger/Webhooks
- Page Access Token
- Meta App Secret
- Groq API key
- HTTPS public URL rehefa apetraka amin'ny hosting

## Fametrahana
1. Adikao ho `.env` ny `.env.example`.
2. Fenoy ny `VERIFY_TOKEN`, `PAGE_ACCESS_TOKEN`, `META_APP_SECRET`, ary `GROQ_API_KEY`.
3. Ataovy `AI_NAME=Olivier` ao amin'ny `.env` raha tianao ho Olivier ny anarany.
4. Aza zaraina amin'olona ny `.env` na ny API keys.
5. Ao amin'ny terminal, ao amin'ity folder ity, alefaso:

   ```bash
   npm install
   npm start
   ```

6. Apetraho amin'ny hosting manome HTTPS ilay app.
7. Ao amin'ny Meta Webhooks, ampiasao:
   - Callback URL: `https://YOUR-DOMAIN/webhook`
   - Verify Token: mitovy tanteraka amin'ny `VERIFY_TOKEN`
   - Subscribe amin'ny Page `messages` event.
8. Ampifandraiso amin'ny Page-nao ny Messenger product ary omeo ny app ny fahazoan-dalana ilaina, anisan'izany `pages_messaging` araka ny fepetra Meta.
9. Ataovy subscribe amin'ny webhook ny Page-nao.

## Fanamarihana
- `AI_NAME` no mamaritra ny anaran'ny bot; default dia `Olivier`.
- `GROQ_MODEL` dia azo ovaina ho modely mbola misy ao amin'ny Groq Console sy azon'ny kaontinao ampiasaina.
- Ny Free tier dia manana rate limits; mety hahazo HTTP 429 raha mihoatra izany.
- Ny tantaran'ny resaka dia tehirizina ao anaty RAM fotsiny ary very rehefa averina alefa ny serveur.
- Mila hajaina ny Messenger messaging window sy ny fitsipika Meta.
- Ny bot dia mamaly hafatra text ihany amin'ity version ity.
- Mampiasa raw request body ny webhook mba hanamarinana ny `X-Hub-Signature-256`.
