# Setting up Google login

Rep Quest uses Firebase's free plan for sign-in and storage. Until `FIREBASE` in `js/cloud.js` is filled in, the app works on the device only and hides the Google button.

1. Create a project at https://console.firebase.google.com (no billing needed).
2. Build > Authentication > Get started > Google > Enable, then save.
3. In Authentication > Settings > Authorized domains, add `aaryansharmacodes.github.io`.
4. Build > Firestore Database > Create database, production mode, then replace the rules with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. Project settings > General > add a Web app. Copy `apiKey` and `projectId`.
6. In https://console.cloud.google.com/apis/credentials for the same project, open the auto-created "Web client". Copy its Client ID, and add `https://aaryansharmacodes.github.io/rep-quest/` under Authorized redirect URIs.
7. Put the three values in `FIREBASE` in `js/cloud.js`, bump `CACHE` in `sw.js` and `APP_VERSION` in `js/core.js`, and push.

These values identify the project and are safe to publish. The rules in step 4 are what keep each person's data private.
