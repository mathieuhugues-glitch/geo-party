# 🌍 Geo Party – le jeu de géographie pour vos soirées

Geo Party est un jeu télévisé de géographie pour adultes, de 2 à 8 joueurs environ (conçu pour 3).
L'écran principal (télévision ou ordinateur) affiche les questions. Chaque joueur répond sur son téléphone après avoir scanné un QR code.
Tout le texte du jeu est en anglais, pour que vous puissiez jouer avec vos amis suédois.

## Les huit manches

Elles se jouent toujours dans cet ordre, et vous pouvez en désélectionner certaines au départ :

| Manche | Principe | Chrono |
|---|---|---|
| 1. Flags | Reconnaître le pays d'après son drapeau. Les pièges sont des drapeaux qui se ressemblent (Tchad/Roumanie, Indonésie/Monaco…). | 15 s |
| 2. Shapes | Reconnaître un pays d'après sa silhouette (territoire principal, nord en haut, sans échelle). Une option « Twist » fait pivoter ou retourne les formes difficiles. | 15 s |
| 3. Capitals | Trouver la capitale. Les pièges sont les grandes villes du même pays (Sydney pour l'Australie, Istanbul pour la Turquie…). Certaines questions sont inversées : « Accra is the capital of… ». Les capitales discutables (Bolivie, Sri Lanka, Afrique du Sud…) sont exclues. | 15 s |
| 4. Map pin | Placer une épingle sur la capitale, sur une carte du monde zoomable. Les points dépendent de la distance. | 20 s |
| 5. Landmarks | La télé montre la photo d'un monument ou d'un site célèbre (pyramides de Gizeh, tours Petronas…), sans son nom. Chacun place une épingle sur la carte de son téléphone. Le nom (« Petronas Towers, Kuala Lumpur ») n'apparaît qu'à la révélation. Points selon la distance, comme Map pin. 63 sites (18 faciles, 22 moyens, 23 difficiles). | 20 s |
| 6. Higher or Lower | Deux pays (drapeau et nom) : lequel a le plus d'habitants, ou la plus grande superficie ? Une question sur quatre est inversée (« FEWER people », « SMALLER »). La révélation affiche les deux valeurs (« 38.0 M », « 450,295 km² »). En facile, l'écart dépasse ×3. En difficile, il est inférieur à 20 %. | 12 s |
| 7. Mystery Country | Trois indices apparaissent toutes les 7 secondes : d'abord un indice difficile (langue, fait marquant), puis la monnaie ou un plat, enfin le continent et les voisins. Les 4 propositions sont visibles dès le début, et vous pouvez répondre à tout moment. Plus vous répondez tôt, plus vous gagnez : jusqu'à 1000, 700 ou 400 points selon l'indice. Une mauvaise réponse vaut 0 et vous bloque. Les indices ne citent jamais le nom du pays ni sa capitale. 64 pays. | 21 s |
| 8. Zoom Out | Une image satellite part d'un détail (un port, une île, un glacier…) puis dézoome pendant environ 15 secondes jusqu'au pays entier. Les frontières apparaissent discrètement à la fin, sans aucune étiquette. Les points passent de 1000 à 300 au fil du dézoom. 42 pays. | 15 s |

- **Choix possibles** : 4 propositions (2 pour Higher or Lower), ou une épingle sur la carte. Aucune saisie au clavier.
- **Longueur** : 6, 10 (par défaut) ou 15 questions par manche. Avec les 8 manches et 6 questions, comptez environ une demi-heure. Avec 10 questions, comptez plutôt trois quarts d'heure.
- **Difficulté** : Easy, Normal (par défaut) ou Expert, au choix sur l'écran de préparation. Les questions vont toujours de la plus facile à la plus difficile, et les pièges se rapprochent de la bonne réponse. Seul le mélange des paliers change :

  | Niveau | facile / moyen / difficile | 6 q | 10 q | 15 q |
  |---|---|---|---|---|
  | Easy | ≈ 50 / 40 / 10 % | 3/2/1 | 5/4/1 | 8/5/2 |
  | Normal | un tiers chacun | 2/2/2 | 3/4/3 | 5/5/5 |
  | Expert | ≈ 10 / 40 / 50 % | 1/2/3 | 1/4/5 | 2/5/8 |

  Le barème ne dépend pas du niveau.
- **Points** : 1000 pour une réponse instantanée, puis une baisse linéaire jusqu'à 500 à la fin du chrono (Mystery Country et Zoom Out ont leur propre barème, voir plus haut).
- **Bonus de série** : +100 par bonne réponse consécutive après la première, plafonné à +500.
- **Map pin et Landmarks** : 1000 points à moins de 50 km, environ 500 à 500 km, puis presque rien au-delà de 2 500 km.
- **Suspense** : le classement reste caché pendant la partie. Il ne s'affiche qu'une fois, à la moitié de chaque manche. Chaque téléphone montre seulement ses propres points.
- **Fin de partie** : le classement est révélé du dernier au premier, puis vient le podium avec confettis. Chaque téléphone affiche son rang. « Play again » ramène à l'écran de préparation avec les mêmes joueurs.
- **Nouvelles questions** : le jeu retient les pays déjà vus (dans ce navigateur), si bien qu'une deuxième partie propose d'autres drapeaux, d'autres pays, d'autres monuments et d'autres duels. Cela vaut pour les huit manches. Le bouton « Reset seen » remet ce compteur à zéro.

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
3. Choisissez les manches, la longueur et la difficulté, puis lancez **Start game**. Le jeu retient vos réglages.

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
- Les manches Map pin et Landmarks n'interrompent pas les séries et n'en accordent pas.
- Les chiffres de Higher or Lower sont des estimations officielles (population 2023, superficie totale avec les eaux intérieures). D'autres sources peuvent donner des valeurs légèrement différentes. Le Kosovo, Taïwan et le Vatican sont absents de cette manche, faute de chiffres dans la même source.
- Les images de Zoom Out datent de 2016 : un aménagement récent (nouvelle île artificielle, nouveau port) peut ne pas y figurer.
- Les frontières dessinées sur la carte suivent Natural Earth. Les territoires contestés y sont représentés selon ses conventions.

## Pour les curieux : vérifications

- `node tools/check-data.js` vérifie les données. Il génère environ 25 000 questions (toutes manches, longueurs et difficultés). Il contrôle :
  - les options distinctes, une seule bonne réponse, aucun doublon dans une manche, et le mélange des paliers ;
  - que chaque photo et chaque image satellite existe et figure dans `CREDITS.md` ;
  - que les indices de Mystery Country ne contiennent ni le nom du pays, ni sa capitale, ni l'adjectif correspondant ;
  - qu'une deuxième partie ne répète aucune question.

  Taille des réserves par manche [facile, moyen, difficile] :
  - Flags : 31/60/106 (197 pays)
  - Shapes : 31/42/91 (164)
  - Capitals : 40/68/66 (174)
  - Map : 47/66/75 (188)
  - Landmarks : 18/22/23 (63 sites)
  - Higher or Lower : paires tirées parmi 194 pays (paliers selon l'écart entre les deux valeurs)
  - Mystery Country : 20/21/23 (64 pays)
  - Zoom Out : 11/15/16 (42 pays)
- `tools/e2e.cjs` est un test Playwright qui simule un écran télé et 3 téléphones sur une partie complète (8 manches × 6 questions par défaut). Il nécessite Node et Playwright :
  `NODE_PATH=<dossier node_modules contenant playwright> DIFF=normal COUNT=6 node tools/e2e.cjs local` (ou `peer` pour le vrai WebRTC). `DIFF` accepte `easy`, `normal` ou `expert`, et `ROUNDS=flags,hilo,…` limite les manches.
- `tools/countries.txt` contient la liste des 197 pays et leurs paliers de difficulté par manche. `tools/build/` contient les scripts qui ont produit `data/` à partir de Natural Earth (sources non incluses).
- Le dossier `screens/` contient des captures d'écran.

## Crédits et licences

La liste complète, photo par photo (auteur, licence, lien), se trouve dans **`CREDITS.md`**.

- Photos de Landmarks : [Wikimedia Commons](https://commons.wikimedia.org/), sous licences libres (CC0, domaine public, CC BY ou CC BY-SA selon la photo). Les photos ont été redimensionnées, et chacune a été vérifiée à l'œil : pas de nom écrit, de panneau, de plan ni de vue intérieure. L'auteur et la licence s'affichent en petit sous chaque photo.
- Images satellite de Zoom Out : Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017), licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Elles sont incluses dans le dossier : aucune connexion n'est nécessaire pour les afficher.
- Population : Banque mondiale, indicateur SP.POP.TOTL, année 2023 ([CC BY 4.0](https://data.worldbank.org/indicator/SP.POP.TOTL)).
- Superficie : superficie totale (eaux intérieures comprises) de l'article Wikipédia [List of countries and dependencies by area](https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_area), essentiellement des chiffres de la Division de statistique des Nations unies, relevés le 29 octobre 2026 (CC BY-SA 4.0).
- Indices de Mystery Country : rédigés pour le jeu et vérifiés un par un.
- Cartes, silhouettes et frontières : [Natural Earth](https://www.naturalearthdata.com/), domaine public.
- Drapeaux : [flag-icons](https://github.com/lipis/flag-icons), MIT.
- Réseau : [PeerJS](https://peerjs.com/), MIT.
- QR code : [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT.
- Police : [Rubik](https://fonts.google.com/specimen/Rubik), SIL Open Font License.

Bonne soirée et bonne chance ! 🏆
