# 🌍 Geo Party – le jeu de géographie pour vos soirées

Geo Party est un jeu télévisé de géographie pour adultes, de 2 à 8 joueurs environ (conçu pour 3).
L'écran principal (télévision ou ordinateur) affiche les questions. Chaque joueur répond sur son téléphone après avoir scanné un QR code.
Tout le texte du jeu est en anglais, pour que vous puissiez jouer avec vos amis suédois.

## Les quatre manches

Elles se jouent toujours dans cet ordre, et vous pouvez en décocher certaines au départ :

| Manche | Principe | Chrono |
|---|---|---|
| 1. Flags | Reconnaître le pays d'après son drapeau. Les pièges sont des drapeaux qui se ressemblent (Tchad/Roumanie, Indonésie/Monaco…). | 15 s |
| 2. Shapes | Reconnaître un pays d'après sa silhouette (territoire principal, nord en haut, sans échelle). Une option « Twist » fait pivoter ou retourne les formes difficiles. | 15 s |
| 3. Capitals | Trouver la capitale. Les pièges sont les grandes villes du même pays (Sydney pour l'Australie, Istanbul pour la Turquie…). Certaines questions sont inversées : « Accra is the capital of… ». Les capitales discutables (Bolivie, Sri Lanka, Afrique du Sud…) sont exclues. | 15 s |
| 4. Map pin | Placer une épingle sur la capitale, sur une carte du monde zoomable. Les points dépendent de la distance. | 20 s |

- **Choix possibles** : 4 propositions, donc aucune saisie au clavier.
- **Nombre de questions** : 5, 10, 15 (par défaut) ou 20 par manche.
- **Difficulté** : trois paliers successifs (easy → medium → hard), avec des pièges de plus en plus proches de la bonne réponse.
- **Points** : 1000 pour une réponse instantanée, puis une baisse linéaire jusqu'à 500 à la fin du chrono.
- **Bonus de série** : +100 par bonne réponse consécutive après la première, plafonné à +500.
- **Map pin** : 1000 points à moins de 50 km, environ 500 à 500 km, puis presque rien au-delà de 2 500 km.
- **Suspense** : le classement reste caché pendant la partie. Il ne s'affiche qu'une fois, à la moitié de chaque manche. Chaque téléphone montre seulement ses propres points.
- **Fin de partie** : le classement est révélé du dernier au premier, puis vient le podium avec confettis. Chaque téléphone affiche son rang. « Play again » ramène à l'écran de préparation avec les mêmes joueurs.
- **Nouvelles questions** : le jeu retient les pays déjà vus (dans ce navigateur), si bien qu'une deuxième partie propose d'autres drapeaux et d'autres pays. Le bouton « Reset seen » remet ce compteur à zéro.

## Tester sur votre Mac

1. Décompressez `geo-party.zip`, puis ouvrez le Terminal dans le dossier `geo-party` :
   ```
   cd ~/Downloads/geo-party
   python3 -m http.server 8000
   ```
2. Ouvrez **http://localhost:8000** dans Chrome ou Safari. C'est l'écran « télé ».
3. Pour simuler des téléphones, ouvrez d'autres onglets sur `http://localhost:8000/play.html?room=CODE`, en remplaçant CODE par les 4 lettres affichées. Ouvrez-les dans des fenêtres de navigation privée différentes, car chaque fenêtre garde son propre joueur.

> ⚠️ Un vrai téléphone ne peut pas joindre « localhost » : ce mot désigne votre Mac lui-même.
> L'écran d'accueil affiche d'ailleurs un avertissement dans ce cas.
> Pour tester avec de vrais téléphones sur le même Wi-Fi, lancez `python3 -m http.server 8000`, puis ouvrez sur le Mac l'adresse `http://<adresse-IP-du-Mac>:8000`.
> Vous trouverez cette adresse dans Réglages Système → Wi-Fi → Détails. Le QR code pointera alors vers cette adresse.

**Mode test sans réseau** : ajoutez `?transport=local` à l'adresse (`http://localhost:8000/?transport=local`).
Les « téléphones » sont alors des onglets du même navigateur (`play.html?room=CODE&transport=local&slot=1`, `slot=2`, …) et aucune connexion internet n'est nécessaire.

## Pour la vraie soirée chez votre ami

Le jeu est un simple site statique, sans serveur à faire tourner. En revanche, il doit être accessible par une adresse web en HTTPS, ouverte à la fois par l'ordinateur de votre ami et par les téléphones (même en 4G).
La solution la plus simple est **GitHub Pages** : vous déposez le contenu du dossier `geo-party` dans un dépôt GitHub, puis vous activez Pages (Settings → Pages). Cela n'a **pas** été fait pour vous : aucun compte n'a été créé et rien n'a été publié. Netlify Drop ou Cloudflare Pages conviennent aussi.

Le soir même :

1. Sur l'ordinateur branché à la télé, ouvrez l'adresse du site, en plein écran (touche F ou bouton ⛶).
2. Chacun scanne le QR code, ou tape l'adresse puis le code de 4 lettres. Chacun choisit ensuite un nom, une couleur et un emoji.
3. Choisissez les manches et le nombre de questions, puis lancez **Start game**.

Contrôles de l'écran télé : Espace = suivant, P = pause, M = son, F = plein écran.

**Si un téléphone se met en veille ou recharge la page**, le joueur revient automatiquement avec son score.
S'il change de téléphone, il lui suffit de rejoindre avec **le même nom** pour reprendre son score.

### Connexion

Les téléphones communiquent directement avec l'écran télé en WebRTC (bibliothèque PeerJS).
Le serveur public gratuit de PeerJS ne sert qu'à la mise en relation, et un relais TURN public prend le relais si les réseaux sont très fermés.
Il faut donc une connexion internet. Tout le reste (drapeaux, cartes, polices, sons) est inclus dans le dossier.

## Limites connues

- Si l'écran télé recharge sa page en pleine partie, la partie en cours est perdue : il faut alors relancer une partie avec les mêmes joueurs. Ne fermez donc pas l'onglet de la télé.
- Le jeu dépend du serveur public PeerJS (0.peerjs.com), gratuit et sans garantie de disponibilité.
- La manche Map pin n'interrompt pas les séries et n'en accorde pas.
- Les frontières dessinées sur la carte suivent Natural Earth. Les territoires contestés y sont représentés selon ses conventions.

## Pour les curieux : vérifications

- `node tools/check-data.js` vérifie les données. Il génère 15 000 questions et contrôle qu'il y a 4 options distinctes, une seule bonne réponse et aucun doublon.
  Taille des réserves par manche [facile, moyen, difficile] :
  - Flags : 31/60/106 (197 pays)
  - Shapes : 31/42/91 (164)
  - Capitals : 40/68/66 (174)
  - Map : 47/66/75 (188)
- `tools/e2e.cjs` est un test Playwright qui simule un écran télé et 3 téléphones sur une partie complète (4 manches × 5 questions). Il nécessite Node et Playwright :
  `NODE_PATH=<dossier node_modules contenant playwright> node tools/e2e.cjs local` (ou `peer` pour le vrai WebRTC).
- `tools/countries.txt` contient la liste des 197 pays et leurs paliers de difficulté par manche. `tools/build/` contient les scripts qui ont produit `data/` à partir de Natural Earth (sources non incluses).
- Le dossier `screens/` contient des captures d'écran.

## Crédits et licences

- Cartes et silhouettes : [Natural Earth](https://www.naturalearthdata.com/), domaine public.
- Drapeaux : [flag-icons](https://github.com/lipis/flag-icons), MIT.
- Réseau : [PeerJS](https://peerjs.com/), MIT.
- QR code : [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT.
- Police : [Rubik](https://fonts.google.com/specimen/Rubik), SIL Open Font License.

Bonne soirée et bonne chance ! 🏆
