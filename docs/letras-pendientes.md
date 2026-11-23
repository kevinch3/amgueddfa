# Letras pendientes

Generado por `python3 -m scripts.letras_pendientes`: no editar a mano. Cómo cargar una letra: skill `video-lyrics`. Los motivos de cada hueco: `data/letras/huecos.json`; qué obra es cada actuación que el programa no nombra: `data/letras/identificaciones.json`.

Obras cantadas con título en el programa y video transcripto: **131** (32 alineadas en todos sus videos, 20 en parte, 18 con texto guardado sin alinear, 61 sin texto). Esa cuenta deja afuera las obras que solo se cantan en videos sin texto publicado (5) y los videos de ediciones sin programa transcripto: los dos están en «Huecos documentados». Obras «a elección» por identificar: **344** apariciones. Actuaciones sin identificar: **288** videos.

## Huecos documentados

No todas las letras van a llegar; cada hueco queda anotado con su motivo. Los motivos vienen de `data/letras/huecos.json` (curado: una entrada por obra o por video, sin citar nada de lo que se canta); «falta el texto» y «sin motivo registrado» son los estados por omisión. Cada caso, en [Detalle de los huecos documentados](#detalle-de-los-huecos-documentados).

| Motivo | Obras | Videos | Qué lo cierra |
|---|---|---|---|
| falta el texto | 81 | 120 | El texto tal como se canta, en su idioma: si es de dominio público, de una fuente pública citada; si no, del mantenedor (skill `video-lyrics`). |
| el texto no coincide con lo que se canta | 7 | 8 | El mantenedor revisa la fuente y manda el texto tal como se canta (estrofas que faltan, estribillos escritos donde se repiten). |
| motivo por confirmar | 3 | 4 | El mantenedor confirma lo que el detalle deja abierto; después la entrada pasa al motivo que corresponda. |
| se canta sin una estrofa | 5 | 6 | Que el alineador acepte, por tramo, qué estrofas se cantan (#129). |
| el reconocedor galés oyó muy poco | 19 | 24 | Reintentar cuando termine la pasada del modelo galés (en curso); si sigue igual, probar un filtro de confianza más bajo dentro de los tramos con letra (#129). |
| los reconocedores oyeron muy poco del canto | 2 | 2 | Escuchar el video para fijar el tramo (y, si hace falta, los tiempos de los versos): lo que oyeron YouTube, Whisper y el modelo galés no alcanza para que el alineador ubique las líneas (#129). |
| el alineador amontona las líneas | 16 | 20 | Que el alineador no se ancle en palabras sueltas o mal oídas, por ejemplo repartiendo desde el inicio del tramo cuando lo oído es poco (#129). |
| no se canta en ese video | 5 | 5 | Nada que alinear ahí: hace falta otra grabación de esa actuación, o corregir a qué competencia apunta el video. |
| versión por confirmar | 2 | 2 | El mantenedor confirma qué versión (y qué texto) se canta; después se pide el texto o se reusa uno guardado. |
| obra «a elección» sin identificar | — | 292 | Escuchar el anuncio o el video para saber qué obra se cantó (o cuál de las alternativas del programa; en un repertorio libre, la línea del programa no nombra ninguna); con el título, la letra se pide como cualquier otra (344 apariciones, 15 con alguna obra ya identificada ahí; lista al final). |
| el video no tiene texto publicado | 17 | 40 | Que el video tenga texto publicado (subtítulos, Whisper o reconstrucción: `scripts/export_video_transcripts.py`); entonces entra en la tabla con sus obras. Lista en [Obras en videos sin texto publicado](#obras-en-videos-sin-texto-publicado). |
| edición sin programa transcripto | — | 283 | Transcribir el programa de la edición (skill `programa-transcription`); hasta entonces, de esos videos solo entran los que tienen una letra alineada o nombran en su título una obra con texto guardado. |
| actuación sin identificar | — | 288 | (258 con texto publicado, 30 sin texto.) Videos de ediciones con programa cuyo título y capítulos no nombran ninguna competencia: saber por el anuncio de cuál es y anotarlo (en una sesión, con un capítulo en `public/marcadores-video/`). Darle texto no alcanza: un video entra en la tabla solo cuando su título, sus capítulos o una letra alineada lo llevan a una competencia cantada. |

Las columnas no se suman: una obra con videos en distintas situaciones cuenta en cada fila que le toca, un video con varias obras también, y «Obras» incluye 12 textos guardados fuera de la tabla del programa. «El video no tiene texto publicado» cuenta también obras que están en la tabla con otros videos; las filas de «a elección», ediciones sin programa y actuaciones sin identificar cuentan solo videos.

La pasada del modelo galés sobre todos los videos publicados está en curso. Cuando termine, se reintentan las obras de «el reconocedor galés oyó muy poco»: videos donde ese reconocedor oyó muy poco del canto, o que no tenían fuente en galés.

Ediciones sin programa transcripto, con sus videos (243 con texto publicado): Chubut 2016 (111), Chubut 2017 (95), Trevelin 2012 (36), Chubut 2011 (21), Trevelin 2016 (11), Chubut 2010 (3), Trevelin 2019 (2), Trevelin 2023 (2), Chubut 2003 (1), Trevelin 2020 (1).

Fuera de las cuentas, además de ceremonias y noticias: 129 videos cuyo título dice que no se canta (instrumento, danza, recitación); 191 videos cuyo título o capítulos nombran una competencia que este informe no lee como cantada (recitación, danza, instrumental); 13 videos de Juventud y Mimosa que llegan a una obra cantada: esos videos no se transcriben (#29).

No es un hueco de letra (fuera de las cuentas): «La muerte del ángel» (Astor Piazolla, arr. Néstor Zadoff), 3 videos. Según el mantenedor (2026-11-20), el arreglo no tiene letra.

## Obras del programa

Primero las de texto probablemente libre (litúrgico, tradicional, autores antiguos: una pista, los derechos los confirma el mantenedor), después por cantidad de videos (una letra sirve para todos). Para cada una hace falta el texto **tal como se canta**, en su idioma. «✅ alineada» cuenta solo los videos con el tramo de esa obra en `data/letras/videos.json`; donde unos videos lo tienen y otros no, «Dónde» marca cada uno con ✅ o ✗. «+N sin texto» son videos de la obra que todavía no tienen texto publicado.

| Obra | Autoría (programa) | Texto | Videos | Dónde | Estado |
|---|---|---|---|---|---|
| Cwlwm cariad | alawon Cymreig traddodiadol, tref. A. Ll. Thomas | probablemente libre | 3 | chubut 2022 comp. 56<br>[Z3IBzc2gERE](https://www.youtube.com/watch?v=Z3IBzc2gERE) [oULXCz__jjg](https://www.youtube.com/watch?v=oULXCz__jjg) [qbNhzuKphGM](https://www.youtube.com/watch?v=qbNhzuKphGM) | falta el texto |
| Iesu, Drud Ddifyrrwch Dynion | J. Bach | probablemente libre | 2 | chubut 2013 comp. 65<br>[RLf-rMsfxVw](https://www.youtube.com/watch?v=RLf-rMsfxVw) [Xc08DZcPQvE](https://www.youtube.com/watch?v=Xc08DZcPQvE) | falta el texto |
| Bugeilio'r Gwenith Gwyn | traddodiadol, Robat Arwyn | probablemente libre | 1 | chubut 2024 comp. 70<br>[wpSYMGm72Bk 16:57](https://www.youtube.com/watch?v=wpSYMGm72Bk&t=1017s) | versión por confirmar |
| Juego a que me quemo (Chispa candela) | tradicional colombiano, arr. Julián Gómez Giraldo | probablemente libre | 1 | chubut 2014 comp. 73<br>[fb3XRSU5XSg](https://www.youtube.com/watch?v=fb3XRSU5XSg) | falta el texto |
| Lux Aeterna | R. Arwyn | probablemente libre | 1 | chubut 2023 comp. 56<br>[Xg70oVF4y6A](https://www.youtube.com/watch?v=Xg70oVF4y6A) | falta el texto |
| Sanctus | Schubert | probablemente libre | 1 | chubut 2024 comp. 56<br>[vbZPAtoYGgY](https://www.youtube.com/watch?v=vbZPAtoYGgY) | falta el texto |
| Sigl-Gân | J. Brahms, trefn. W. S. Gwynn Williams | probablemente libre | 1 (+1 sin texto) | chubut 2015 comp. 66<br>[sl7LHWqYrhE](https://www.youtube.com/watch?v=sl7LHWqYrhE) | falta el texto |
| Cwsg Osian | Cleif Harpwood / Alun Sbardun Huws | verificar derechos | 5 | chubut 2008 comp. 62; chubut 2025 comp. 54<br>[25MwUTXdIXk](https://www.youtube.com/watch?v=25MwUTXdIXk) [Q83D5ql9MCE](https://www.youtube.com/watch?v=Q83D5ql9MCE) [rl5GhfJC4qY](https://www.youtube.com/watch?v=rl5GhfJC4qY) [vVUb3Jllzsk](https://www.youtube.com/watch?v=vVUb3Jllzsk) [Y0Az9sUWak0](https://www.youtube.com/watch?v=Y0Az9sUWak0) | falta el texto |
| Anfonaf Angel | Hywel Gwynfryn – Robat Arwyn | verificar derechos | 3 | chubut 2014 comp. 70<br>[3U_Q9iXVmLw](https://www.youtube.com/watch?v=3U_Q9iXVmLw) [cbs713oeNx4](https://www.youtube.com/watch?v=cbs713oeNx4) [sM3Yq450GMY](https://www.youtube.com/watch?v=sM3Yq450GMY) | falta el texto |
| Blodau ger y Drws | Meirion Williams | verificar derechos | 3 (+1 sin texto) | chubut 2015 comp. 54<br>[84kbTqp3ksk](https://www.youtube.com/watch?v=84kbTqp3ksk) [DKpP5K9XTsc](https://www.youtube.com/watch?v=DKpP5K9XTsc) [f-ZUpxthYJ0](https://www.youtube.com/watch?v=f-ZUpxthYJ0) | falta el texto |
| Chwyth, chwyth aeafol chwa | TH. A. Arne | verificar derechos | 3 | chubut 2014 comp. 40<br>[R4tkVGn9pjg](https://www.youtube.com/watch?v=R4tkVGn9pjg) [l2rPv06-TNg](https://www.youtube.com/watch?v=l2rPv06-TNg) [lc0bkNk9VWY](https://www.youtube.com/watch?v=lc0bkNk9VWY) | falta el texto |
| Mi garganta | melodía popular argentina, arr. Carlos Guastavino | verificar derechos | 3 | chubut 2014 comp. 55<br>[1nX9tfHQXaI](https://www.youtube.com/watch?v=1nX9tfHQXaI) [8NBqb8lnGNE](https://www.youtube.com/watch?v=8NBqb8lnGNE) [ZULDqi7piuc](https://www.youtube.com/watch?v=ZULDqi7piuc) | falta el texto |
| O Dduw, Rhana'th Fendithion | J. Rutter | verificar derechos | 3 | chubut 2018 comp. 72<br>[aixCKFp0JQI](https://www.youtube.com/watch?v=aixCKFp0JQI) [utHSvsjwvwo 6:09:16](https://www.youtube.com/watch?v=utHSvsjwvwo&t=22156s) [zAlvajq-8Oo](https://www.youtube.com/watch?v=zAlvajq-8Oo) | falta el texto |
| Rhyddid | E. Olwen Jones | verificar derechos | 3 | chubut 2012 comp. 51; chubut 2019 comp. 51<br>[6E08seWPP4s](https://www.youtube.com/watch?v=6E08seWPP4s) [A2zI5UduN9c](https://www.youtube.com/watch?v=A2zI5UduN9c) [1pJHVEUNZ08](https://www.youtube.com/watch?v=1pJHVEUNZ08) | falta el texto |
| Salamanqueando pa' mí | Raúl Carnota, v. c. Hugo de la Vega | verificar derechos | 3 | chubut 2015 comp. 89<br>[F54HTSkjvLw](https://www.youtube.com/watch?v=F54HTSkjvLw) [V_AiZP9gVFE](https://www.youtube.com/watch?v=V_AiZP9gVFE) [wldmZUPS5fY](https://www.youtube.com/watch?v=wldmZUPS5fY) | falta el texto |
| Tra Bo Dau | trefniant Sydney Northcote | verificar derechos | 3 | chubut 2008 comp. 45<br>[oUc2o1qrQac](https://www.youtube.com/watch?v=oUc2o1qrQac) [r7J0vAm6AUY](https://www.youtube.com/watch?v=r7J0vAm6AUY) [sOQSNLYjCfI](https://www.youtube.com/watch?v=sOQSNLYjCfI) | falta el texto |
| Y Blodyn Gwyn | R. H. Jones / E. J. Hughes | verificar derechos | 3 | chubut 2013 comp. 49<br>[NuN_yQdo2DA](https://www.youtube.com/watch?v=NuN_yQdo2DA) [X3DTSQfS-lI](https://www.youtube.com/watch?v=X3DTSQfS-lI) [XqFIz1BdGls](https://www.youtube.com/watch?v=XqFIz1BdGls) | falta el texto |
| Zamba del grillo | Atahualpa Yupanqui, arr. Juanjo Cura | verificar derechos | 3 | chubut 2014 comp. 65<br>[AM4Q7BwXfJo](https://www.youtube.com/watch?v=AM4Q7BwXfJo) [DCh5B75KGuM](https://www.youtube.com/watch?v=DCh5B75KGuM) [ZBhvUSP7PYU](https://www.youtube.com/watch?v=ZBhvUSP7PYU) | falta el texto |
| Aberdaron | Meirion Williams – Cynan | verificar derechos | 2 | chubut 2018 comp. 42<br>[1tKBGyxDOq0](https://www.youtube.com/watch?v=1tKBGyxDOq0) [UmQ0zFK4ntM](https://www.youtube.com/watch?v=UmQ0zFK4ntM) | falta el texto |
| Alaw Mair | trefn. Einion Dafydd | verificar derechos | 2 | chubut 2023 comp. 61<br>[HffK29rx9X0](https://www.youtube.com/watch?v=HffK29rx9X0) [R5SoIlAUMV0](https://www.youtube.com/watch?v=R5SoIlAUMV0) | falta el texto |
| Byw Fyddi Nant Gwrtheyrn | R. LL. Owain / R. Arwyn | verificar derechos | 2 | chubut 2013 comp. 58<br>[DD_UX20O-vg](https://www.youtube.com/watch?v=DD_UX20O-vg) [vhBq1_di8DM](https://www.youtube.com/watch?v=vhBq1_di8DM) | falta el texto |
| Dashenka | Islwyn Ffowc Ellis | verificar derechos | 2 | chubut 2022 comp. 68<br>[-t5r4pwKx50 7:15:30](https://www.youtube.com/watch?v=-t5r4pwKx50&t=26130s) [laF4ngmu5pI](https://www.youtube.com/watch?v=laF4ngmu5pI) | falta el texto |
| Dere Di | J. Dowland, trefn. W. S. Gwynn Williams | verificar derechos | 2 | chubut 2014 comp. 51<br>[9AqpcF1Etxk](https://www.youtube.com/watch?v=9AqpcF1Etxk) [WYa6HDALUPQ](https://www.youtube.com/watch?v=WYa6HDALUPQ) | falta el texto |
| Dod ar fy Mhen | Mary Lloyd Prichard | verificar derechos | 2 | chubut 2023 comp. 58<br>[Bzz-Kt3iR8Q](https://www.youtube.com/watch?v=Bzz-Kt3iR8Q) [LXqDlh3REiY](https://www.youtube.com/watch?v=LXqDlh3REiY) | falta el texto |
| Ewch Allan i'r Holl Fyd mewn Hedd | John Rutter | verificar derechos | 2 | chubut 2012 comp. 64<br>[96lBJxPXTUw](https://www.youtube.com/watch?v=96lBJxPXTUw) [cI1BPQIUXCY](https://www.youtube.com/watch?v=cI1BPQIUXCY) | falta el texto |
| Nos da Ffrindiau | G. Richards, trefn. C. Jones | verificar derechos | 2 | chubut 2013 comp. 54<br>[4o8eu6o_I1U](https://www.youtube.com/watch?v=4o8eu6o_I1U) [UyVA0edNAj8](https://www.youtube.com/watch?v=UyVA0edNAj8) | falta el texto |
| Pensarn | Dilys Thomas | verificar derechos | 2 | chubut 2022 comp. 52<br>[bu-8DZRzTtQ](https://www.youtube.com/watch?v=bu-8DZRzTtQ) [uZ4dG2rhcQI](https://www.youtube.com/watch?v=uZ4dG2rhcQI) | falta el texto |
| Rhywle gyda'r hwyr | Tudur Dylan Jones / Hector Mac Donald | verificar derechos | 2 | chubut 2022 comp. 59<br>[GTMOQf-GWjM](https://www.youtube.com/watch?v=GTMOQf-GWjM) [t4vIvH2r3UQ](https://www.youtube.com/watch?v=t4vIvH2r3UQ) | falta el texto |
| Whitburn | Henry Baker, trefn. Eric Jones | verificar derechos | 2 | chubut 2018 comp. 59<br>[YmCzK_ad_MU](https://www.youtube.com/watch?v=YmCzK_ad_MU) [qiv2ToebGYQ](https://www.youtube.com/watch?v=qiv2ToebGYQ) | falta el texto |
| Arrayán | serie «Flores patagónicas», Clydwyn Jones – Virgilio Zampini | verificar derechos | 1 | chubut 2013 comp. 63<br>[NJK9mAlm5-0](https://www.youtube.com/watch?v=NJK9mAlm5-0) | falta el texto |
| Awelon y Mynydd | Meirion Williams | verificar derechos | 1 (+2 sin texto) | chubut 2013 comp. 39<br>[_4yagAjVxKY](https://www.youtube.com/watch?v=_4yagAjVxKY) | falta el texto |
| Boneddwr Mawr o'r Bala | trefn. Megan Morris | verificar derechos | 1 (+1 sin texto) | chubut 2014 comp. 56<br>[kYRmo5nwhaA](https://www.youtube.com/watch?v=kYRmo5nwhaA) | falta el texto |
| Byw fyddi, Nantgwrtheyrn | — | verificar derechos | 1 | chubut 2025 comp. 64<br>[KKQJfmCIACk](https://www.youtube.com/watch?v=KKQJfmCIACk) | falta el texto |
| Cân Manawydan | M. Hopword / H. Mac Donald | verificar derechos | 1 | chubut 2019 comp. 59<br>[WeaRDK_vbiw](https://www.youtube.com/watch?v=WeaRDK_vbiw) | falta el texto |
| Coedmor | R. L. Jones, trefn. Haydn | verificar derechos | 1 | chubut 2014 comp. 57<br>[2aleZnmEyMY](https://www.youtube.com/watch?v=2aleZnmEyMY) | falta el texto |
| Cofio dy Wyneb | Emyr Huws Jones | verificar derechos | 1 | chubut 2012 comp. 55<br>[gSFrxBd-nto](https://www.youtube.com/watch?v=gSFrxBd-nto) | falta el texto |
| Croeso Patagonia | Esyllt Roberts – Héctor Mac Donald | verificar derechos | 1 | chubut 2015 comp. 88<br>[mKGy7Dnhfz8](https://www.youtube.com/watch?v=mKGy7Dnhfz8) | falta el texto |
| Cueca del arenal | Jaime Dávalos – Eduardo Falú, arr. Enrique «Chino» Segura | verificar derechos | 1 | chubut 2015 comp. 81<br>[Q4Pj4bSJwf4](https://www.youtube.com/watch?v=Q4Pj4bSJwf4) | falta el texto |
| Cydiwn ddwylo | — | verificar derechos | 1 | chubut 2025 comp. 61<br>[Q5xCNF3y1k0](https://www.youtube.com/watch?v=Q5xCNF3y1k0) | falta el texto |
| Dal hi'n Dynn | R. Arwyn | verificar derechos | 1 | chubut 2012 comp. 63<br>[VIXOzSYSmlA](https://www.youtube.com/watch?v=VIXOzSYSmlA) | falta el texto |
| Ei Gwmni Ef | Eric Jones – W Rhys Nicholas | verificar derechos | 1 | chubut 2024 comp. 68<br>[W1z_1ulc_lY](https://www.youtube.com/watch?v=W1z_1ulc_lY) | falta el texto |
| Er Hwylio'r Haul | R. Arwyn – Robin Llwyd ab Owain | verificar derechos | 1 | chubut 2023 comp. 68<br>[AsR2EuoJX1o](https://www.youtube.com/watch?v=AsR2EuoJX1o) | falta el texto |
| Eres la paz | — | verificar derechos | 1 | trevelin 2026 comp. 127<br>[IaNz9fMsg68](https://www.youtube.com/watch?v=IaNz9fMsg68) | falta el texto |
| Eryr Pengwern | o'r sioe gerdd «Heledd», L. Gittins – D. Williams – P. Roberts | verificar derechos | 1 | chubut 2014 comp. 60<br>[ESoQj11KetM](https://www.youtube.com/watch?v=ESoQj11KetM) | falta el texto |
| Glan y Nant | — | verificar derechos | 1 | chubut 2025 comp. 55<br>[BnfV0AvvByE](https://www.youtube.com/watch?v=BnfV0AvvByE) | falta el texto |
| Gwin Beaujolais | Robat Arwyn | verificar derechos | 1 | chubut 2018 comp. 58<br>[znHQyIuMFVQ](https://www.youtube.com/watch?v=znHQyIuMFVQ) | falta el texto |
| Heb Amynedd Doeth Ni Fydd | — | verificar derechos | 1 | chubut 2012 comp. 48<br>[vFrrOFE6_UM](https://www.youtube.com/watch?v=vFrrOFE6_UM) | falta el texto |
| Huddersfield | J. Newton | verificar derechos | 1 | chubut 2022 comp. 66<br>[eYr4bFtriWw 1:55](https://www.youtube.com/watch?v=eYr4bFtriWw&t=115s) | se canta sin una estrofa |
| Laudamus | Pantecelyn – William Owen | verificar derechos | 1 | chubut 2015 comp. 74<br>[RVs3i42XPWY](https://www.youtube.com/watch?v=RVs3i42XPWY) | versión por confirmar |
| Myrddin | R. Arwyn – R. Llwyd | verificar derechos | 1 | chubut 2012 comp. 52<br>[ehqxCSs0UZ0](https://www.youtube.com/watch?v=ehqxCSs0UZ0) | falta el texto |
| Popule meus | Leonardo San Juan | verificar derechos | 1 | chubut 2024 comp. 72<br>[W1z_1ulc_lY](https://www.youtube.com/watch?v=W1z_1ulc_lY) | falta el texto |
| Quae moerebat et dolebat | del «Stabat Mater», Giambattista Pergolesi | verificar derechos | 1 | chubut 2008 comp. 52<br>[h3uIDhOeVyc](https://www.youtube.com/watch?v=h3uIDhOeVyc) | falta el texto |
| Si a mí me hubieran dicho | Beatriz Corona | verificar derechos | 1 | chubut 2025 comp. 67<br>[BC61L8txOaQ 6:40:29](https://www.youtube.com/watch?v=BC61L8txOaQ&t=24029s) | falta el texto |
| Stesion Strata | Tecwyn Ifan, trefniant Euros Rhys Evans | verificar derechos | 1 | chubut 2022 comp. 55<br>[jwdDEPP-Pd0](https://www.youtube.com/watch?v=jwdDEPP-Pd0) | falta el texto |
| Suo-Gân | — | verificar derechos | 1 | trevelin 2026 comp. 51<br>[IaNz9fMsg68](https://www.youtube.com/watch?v=IaNz9fMsg68) | falta el texto |
| Teyrnasa, Iesu Mawr | trefn. Jenkin Morgan | verificar derechos | 1 | chubut 2014 comp. 69<br>[fTEn7dSJJxQ](https://www.youtube.com/watch?v=fTEn7dSJJxQ) | falta el texto |
| Theodora | J. Vernon Lewis – A. Legge | verificar derechos | 1 | chubut 2023 comp. 54<br>[LQ28BhyOZBQ 11:19](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=679s) | falta el texto |
| Tu traditora | Orlando de Lassus | verificar derechos | 1 (+1 sin texto) | chubut 2018 comp. 65<br>[eNmj-1_HlIk 25:29](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=1529s) | falta el texto |
| Y Cymro | Meirion Williams | verificar derechos | 1 | chubut 2024 comp. 43<br>[VDCKHPXzibM 33:16](https://www.youtube.com/watch?v=VDCKHPXzibM&t=1996s) | falta el texto |
| Y Llyn | Meirion Williams | verificar derechos | 1 | chubut 2013 comp. 40<br>[WxivXfeGnVA](https://www.youtube.com/watch?v=WxivXfeGnVA) | falta el texto |
| Yn Iach i Ti, Gymru | Ceiriog – S. Northcote | verificar derechos | 1 | chubut 2023 comp. 43<br>[V62LETLL_ZA](https://www.youtube.com/watch?v=V62LETLL_ZA) | falta el texto |
| Cwm Rhondda | John Hughes / Williams Wiliams, Pantycelyn | probablemente libre | 4 | chubut 2008 comp. 65<br>✅ [K3uYyZGC68o](https://www.youtube.com/watch?v=K3uYyZGC68o) ✗ [NQev8Jjs3mo](https://www.youtube.com/watch?v=NQev8Jjs3mo) ✅ [cdXPiraxidQ](https://www.youtube.com/watch?v=cdXPiraxidQ) ✅ [faauFGRzVro](https://www.youtube.com/watch?v=faauFGRzVro) | ✅ 3 de 4 videos; sin alinear en 1: el reconocedor galés oyó muy poco |
| Ubi caritas | Gjeilo | probablemente libre | 4 | chubut 2023 comp. 76<br>✅ [7GeZCEDgcoc](https://www.youtube.com/watch?v=7GeZCEDgcoc) ✗ [8KefoF3wKo0](https://www.youtube.com/watch?v=8KefoF3wKo0) ✅ [LQ28BhyOZBQ 8:44:52](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=31492s) ✅ [x0-pSbbCHIA](https://www.youtube.com/watch?v=x0-pSbbCHIA) | ✅ 3 de 4 videos; sin alinear en 1: no se canta en ese video |
| Ar gyfer heddiw'r bore | carol traddodiadol, Eos Iâl | probablemente libre | 3 | chubut 2022 comp. 51<br>[-ENPPYxWGbw](https://www.youtube.com/watch?v=-ENPPYxWGbw) [3q3bZtuLbzo](https://www.youtube.com/watch?v=3q3bZtuLbzo) [RFm_ZuU6Zo8](https://www.youtube.com/watch?v=RFm_ZuU6Zo8) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Ave María | Dante Andreo | probablemente libre | 3 (+3 sin texto) | chubut 2015 comp. 82<br>[2Gd6ZkLn6as](https://www.youtube.com/watch?v=2Gd6ZkLn6as) [i76Yv67orw4](https://www.youtube.com/watch?v=i76Yv67orw4) [s96_FOydUmo](https://www.youtube.com/watch?v=s96_FOydUmo) | ✅ alineada |
| Ave Maria | Marcelo Valva | probablemente libre | 3 | chubut 2022 comp. 70<br>[-t5r4pwKx50 8:24:13](https://www.youtube.com/watch?v=-t5r4pwKx50&t=30253s) [9HciLCqfIas](https://www.youtube.com/watch?v=9HciLCqfIas) [dT8A2GQSDlc](https://www.youtube.com/watch?v=dT8A2GQSDlc) | ✅ alineada |
| Cantate Domino | Hans Leo Hasler | probablemente libre | 3 | chubut 2023 comp. 65<br>✅ [AnLRusbVjGs](https://www.youtube.com/watch?v=AnLRusbVjGs) ✗ [EUtZrvORMXw](https://www.youtube.com/watch?v=EUtZrvORMXw) ✅ [LQ28BhyOZBQ 7:04:06](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=25446s) | ✅ 2 de 3 videos; sin alinear en 1: no se canta en ese video |
| Claros y frescos ríos | anónimo siglo XVI | probablemente libre | 3 (+1 sin texto) | chubut 2013 comp. 52<br>✅ [Q9H8mauENMw](https://www.youtube.com/watch?v=Q9H8mauENMw) ✗ [cBsyeRTrc18](https://www.youtube.com/watch?v=cBsyeRTrc18) ✅ [kHsF8eQ1L6Y](https://www.youtube.com/watch?v=kHsF8eQ1L6Y) | ✅ 2 de 3 videos; sin alinear en 1: el alineador amontona las líneas |
| Es ist ein Ros' entsprungen | Michael Praetorius | probablemente libre | 2 | chubut 2019 comp. 54<br>[3jnNklLlxQ0 28:24](https://www.youtube.com/watch?v=3jnNklLlxQ0&t=1704s) [s07a0VA2zus](https://www.youtube.com/watch?v=s07a0VA2zus) | texto guardado, sin alinear: el alineador amontona las líneas |
| La pastorella si leva per tempo | anónimo del siglo XV | probablemente libre | 2 | chubut 2008 comp. 84<br>✅ [b9p2OkPUZk8](https://www.youtube.com/watch?v=b9p2OkPUZk8) ✗ [e3hQ1pdkgrE](https://www.youtube.com/watch?v=e3hQ1pdkgrE) | ✅ 1 de 2 videos; sin alinear en 1: el alineador amontona las líneas |
| Let all mortal flesh keep silence | Edward Bairstow | probablemente libre | 2 | chubut 2022 comp. 72<br>[-t5r4pwKx50 7:45:45](https://www.youtube.com/watch?v=-t5r4pwKx50&t=27945s) [HxNKKrGtTww](https://www.youtube.com/watch?v=HxNKKrGtTww) | ✅ alineada |
| Pater noster | Igor Stravinsky | probablemente libre | 2 | chubut 2018 comp. 64<br>[ZFTQmoycc9Y](https://www.youtube.com/watch?v=ZFTQmoycc9Y) [eNmj-1_HlIk 1:30:39](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=5439s) | ✅ alineada |
| Wade in the water | espiritual negro, anónimo, arr. Muitis | probablemente libre | 2 | chubut 2018 comp. 56<br>[_M_c9qh2pvM](https://www.youtube.com/watch?v=_M_c9qh2pvM) [utHSvsjwvwo 2:59:59](https://www.youtube.com/watch?v=utHSvsjwvwo&t=10799s) | ✅ alineada |
| Affanni del pensier | arietta, George F. Händel | probablemente libre | 1 | chubut 2018 comp. 47<br>[eNmj-1_HlIk 24:13](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=1453s) | texto guardado, sin alinear: no se canta en ese video |
| Ave María | Karl Jenkins | probablemente libre | 1 | chubut 2019 comp. 74<br>[SvBTOh3OlMg 3:13:26](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=11606s) | ✅ alineada |
| Ave María | Villa Lobos | probablemente libre | 1 | chubut 2013 comp. 69<br>[W8VmPf8ZAZs](https://www.youtube.com/watch?v=W8VmPf8ZAZs) | ✅ alineada |
| Beati mortui | Felix Mendelssohn | probablemente libre | 1 | chubut 2023 comp. 72<br>[AnLRusbVjGs](https://www.youtube.com/watch?v=AnLRusbVjGs) | ✅ alineada |
| In stiller Nacht | Johannes Brahms | probablemente libre | 1 | chubut 2026 comp. 79<br>[hVtD63KLlsw 9:53:02](https://www.youtube.com/watch?v=hVtD63KLlsw&t=35582s) | texto guardado, sin alinear: el alineador amontona las líneas |
| O bone Jesu – Lux Aeterna | Fernando Moruja | probablemente libre | 1 | chubut 2025 comp. 74<br>[BC61L8txOaQ 10:15:14](https://www.youtube.com/watch?v=BC61L8txOaQ&t=36914s) | ✅ alineada; 1 actuación más sin alinear: el texto no coincide con lo que se canta |
| Tshotsholoza | tradicional sudafricano, arr. Jeffery L. Ames | probablemente libre | 1 | chubut 2014 comp. 64<br>[RZ3aHrvj4Es](https://www.youtube.com/watch?v=RZ3aHrvj4Es) | texto guardado, sin alinear: el alineador amontona las líneas |
| Nada | tango, José Dames – Horacio Sanguinetti, arr. Eduardo Ferraudi | verificar derechos | 5 | chubut 2013 comp. 68; chubut 2014; chubut 2019<br>✅ [-272dzknxa8](https://www.youtube.com/watch?v=-272dzknxa8) ✗ [gaMvo5_oXhg](https://www.youtube.com/watch?v=gaMvo5_oXhg) ✗ [sCboAvAxOKU](https://www.youtube.com/watch?v=sCboAvAxOKU) ✅ [qtFGkYN7FyQ 0:35](https://www.youtube.com/watch?v=qtFGkYN7FyQ&t=35s) +1 más | ✅ 3 de 5 videos; sin alinear en 2: el alineador amontona las líneas |
| Alfonsina y el mar | A. Ramírez – F. Luna, v. c. C. Jones | verificar derechos | 4 | chubut 2012 comp. 67; chubut 2019<br>[-3MdFJJ4-Qs](https://www.youtube.com/watch?v=-3MdFJJ4-Qs) [zJE9xsshiuM](https://www.youtube.com/watch?v=zJE9xsshiuM) [SvBTOh3OlMg 2:06:40](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=7600s) [q2NS3HP13-k](https://www.youtube.com/watch?v=q2NS3HP13-k) | ✅ alineada |
| Cân yr Arad Goch | Idris Lewis – Ceiriog | verificar derechos | 4 | chubut 2014 comp. 43; chubut 2018<br>✗ [0ah0WrQLEa4](https://www.youtube.com/watch?v=0ah0WrQLEa4) ✗ [8dpPe64kDpo](https://www.youtube.com/watch?v=8dpPe64kDpo) ✗ [N33ihYcQHEk](https://www.youtube.com/watch?v=N33ihYcQHEk) ✅ [ixnMBU-jGSI](https://www.youtube.com/watch?v=ixnMBU-jGSI) | ✅ 1 de 4 videos; sin alinear en 3: el alineador amontona las líneas |
| En los brazos de la luna | Alfonso Letelier | verificar derechos | 4 | chubut 2008 comp. 60<br>[2VjZIBTMmqo](https://www.youtube.com/watch?v=2VjZIBTMmqo) [BFkVC4Xe7RA](https://www.youtube.com/watch?v=BFkVC4Xe7RA) [D2N_oZvygxo](https://www.youtube.com/watch?v=D2N_oZvygxo) [cLZdGxOA1TE](https://www.youtube.com/watch?v=cLZdGxOA1TE) | ✅ alineada |
| La vieja | Hermanos Díaz, arr. Vivian Tabush · Hernán Díaz, arr. Vivian Tabbush | verificar derechos | 4 | chubut 2018 comp. 67; trevelin 2021 comp. 102<br>✗ [2HAIydtrM4k](https://www.youtube.com/watch?v=2HAIydtrM4k) ✗ [T3ZxMzX5pgQ](https://www.youtube.com/watch?v=T3ZxMzX5pgQ) ✅ [eNmj-1_HlIk 1:01:00](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=3660s) ✅ [adFH5gX0z80](https://www.youtube.com/watch?v=adFH5gX0z80) | ✅ 2 de 4 videos; sin alinear en 2: el alineador amontona las líneas |
| Sebben, crudele | Antonio Caldara | verificar derechos | 4 | chubut 2019 comp. 47<br>[ZfwMxCXBdpM 56:53](https://www.youtube.com/watch?v=ZfwMxCXBdpM&t=3413s) [kq7OuDOKFR0](https://www.youtube.com/watch?v=kq7OuDOKFR0) [pACfvOfSW9I](https://www.youtube.com/watch?v=pACfvOfSW9I) [vdriCRAMgdk](https://www.youtube.com/watch?v=vdriCRAMgdk) | ✅ alineada |
| Newyddion braf | Ron Jones / J. Dafydd – E. Lewys | verificar derechos | 3 | chubut 2012; chubut 2019 comp. 52<br>✅ [Oev0xyrE5bY](https://www.youtube.com/watch?v=Oev0xyrE5bY) ✗ [nkwfBKiLMIg](https://www.youtube.com/watch?v=nkwfBKiLMIg) ✗ [tF_V5HsV-NA](https://www.youtube.com/watch?v=tF_V5HsV-NA) | ✅ 1 de 3 videos; sin alinear en 2: el reconocedor galés oyó muy poco |
| Sul y Blodau | Owen Williams – Eifion Wyn | verificar derechos | 3 | chubut 2012 comp. 40<br>✅ [MaG1YJk7KV8](https://www.youtube.com/watch?v=MaG1YJk7KV8) ✗ [qFZyl93FA9A](https://www.youtube.com/watch?v=qFZyl93FA9A) ✅ [y8jdA0OUEvg](https://www.youtube.com/watch?v=y8jdA0OUEvg) | ✅ 2 de 3 videos; sin alinear en 1: el alineador amontona las líneas |
| Suo Gân | G. Glyn | verificar derechos | 3 | chubut 2013 comp. 66<br>✅ [RJCMbTchtgw](https://www.youtube.com/watch?v=RJCMbTchtgw) ✗ [lVJXiosXPo4](https://www.youtube.com/watch?v=lVJXiosXPo4) ✗ [ps3CFGC3AfE](https://www.youtube.com/watch?v=ps3CFGC3AfE) | ✅ 1 de 3 videos; sin alinear en 2: el reconocedor galés oyó muy poco |
| Tamquam agnus | Tomás Luis de Victoria | verificar derechos | 3 | chubut 2018 comp. 54<br>[9Z8ncfFoWGc](https://www.youtube.com/watch?v=9Z8ncfFoWGc) [M3YhNXwo61M](https://www.youtube.com/watch?v=M3YhNXwo61M) [utHSvsjwvwo 6:15:04](https://www.youtube.com/watch?v=utHSvsjwvwo&t=22504s) | ✅ alineada |
| Zamba del carnaval | Cuchi Leguizamón, versión coral Pablo D. Roberto | verificar derechos | 3 | chubut 2022 comp. 71<br>[-t5r4pwKx50 8:04:03](https://www.youtube.com/watch?v=-t5r4pwKx50&t=29043s) [5rDvIR1TtBY 0:25](https://www.youtube.com/watch?v=5rDvIR1TtBY&t=25s) [jOOx90-7F8c](https://www.youtube.com/watch?v=jOOx90-7F8c) | ✅ alineada |
| Allá lejos y hace tiempo | Ariel Ramírez y Armando Tejada Gómez, arr. Néstor Zadoff | verificar derechos | 2 | chubut 2018 comp. 76<br>[eNmj-1_HlIk 4:47:18](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=17238s) [vmTVvg_KPRg](https://www.youtube.com/watch?v=vmTVvg_KPRg) | ✅ alineada |
| Angor | Tudur Huws Jones | verificar derechos | 2 | chubut 2024 comp. 58<br>[Fh7i29-94XY](https://www.youtube.com/watch?v=Fh7i29-94XY) [L6FSD_iI5ew](https://www.youtube.com/watch?v=L6FSD_iI5ew) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Ar Lan y Môr | trefn. D. E. Parry Williams | verificar derechos | 2 | chubut 2018 comp. 71<br>[pOQSuZMyuaI](https://www.youtube.com/watch?v=pOQSuZMyuaI) [utHSvsjwvwo 7:56:22](https://www.youtube.com/watch?v=utHSvsjwvwo&t=28582s) | texto guardado, sin alinear: el texto no coincide con lo que se canta |
| Aros mae'r Mynyddau Mawr | Ceiriog a Meirion Williams | verificar derechos | 2 | chubut 2008 comp. 47<br>✅ [E7EJduzrRL0](https://www.youtube.com/watch?v=E7EJduzrRL0) ✗ [bnN5qk4QWVQ](https://www.youtube.com/watch?v=bnN5qk4QWVQ) | ✅ 1 de 2 videos; sin alinear en 1: el reconocedor galés oyó muy poco |
| Caro mio ben | Giuseppe Giordani | verificar derechos | 2 | chubut 2008 comp. 53<br>[7ElvYmHeMqY](https://www.youtube.com/watch?v=7ElvYmHeMqY) [yS-pU_-5fnQ](https://www.youtube.com/watch?v=yS-pU_-5fnQ) | ✅ alineada |
| Ciego quisiera haber sido | Carlos Guastavino – Eduardo Falú | verificar derechos | 2 (+1 sin texto) | chubut 2013 comp. 53<br>[2JkAlku3Kr8](https://www.youtube.com/watch?v=2JkAlku3Kr8) [tbDh70HXvDY](https://www.youtube.com/watch?v=tbDh70HXvDY) | ✅ alineada |
| Cinema Paradiso (Se) | Ennio Morricone | verificar derechos | 2 | chubut 2025 comp. 49<br>[MIW7333GiIY 4:16:48](https://www.youtube.com/watch?v=MIW7333GiIY&t=15408s) [YJnenM8tw0I](https://www.youtube.com/watch?v=YJnenM8tw0I) | ✅ alineada |
| Como pájaros en el aire | Peteco Carabajal, arr. Liliana Cangiano | verificar derechos | 2 | chubut 2014 comp. 62<br>✅ [-250wdPJHUk](https://www.youtube.com/watch?v=-250wdPJHUk) ✗ [g3P3_CNOVTk](https://www.youtube.com/watch?v=g3P3_CNOVTk) | ✅ 1 de 2 videos; sin alinear en 1: el alineador amontona las líneas |
| Eiddot Ti, O Dduw, yw y Mawredd | — | verificar derechos | 2 | chubut 2012 comp. 62<br>[6bEQQTDyMqY](https://www.youtube.com/watch?v=6bEQQTDyMqY) [ATN6kZ86h8s](https://www.youtube.com/watch?v=ATN6kZ86h8s) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Gurisito | candombe con percusión corporal, Daniel Viglietti, versión coral Pablo D. Roberto | verificar derechos | 2 | chubut 2022 comp. 61<br>✅ [0X83qrUotz0 1:10:40](https://www.youtube.com/watch?v=0X83qrUotz0&t=4240s) ✗ [FR9inQWeGI8](https://www.youtube.com/watch?v=FR9inQWeGI8) | ✅ 1 de 2 videos; sin alinear en 1: los reconocedores oyeron muy poco del canto |
| Miedo | Fernando Moruja | verificar derechos | 2 | chubut 2019 comp. 65<br>✅ [SQHehsJfn1w](https://www.youtube.com/watch?v=SQHehsJfn1w) ✗ [ZfwMxCXBdpM 1:43:36](https://www.youtube.com/watch?v=ZfwMxCXBdpM&t=6216s) | ✅ 1 de 2 videos; sin alinear en 1: no se canta en ese video |
| O Nefol Addfwyn Oen | — | verificar derechos | 2 | chubut 2008; chubut 2025 comp. 53<br>✅ [cqp_VwkQIbc 0:04](https://www.youtube.com/watch?v=cqp_VwkQIbc&t=4s) ✗ [YJnenM8tw0I 1:58](https://www.youtube.com/watch?v=YJnenM8tw0I&t=118s) | ✅ 1 de 2 videos; sin alinear en 1: el reconocedor galés oyó muy poco |
| O! Deuwch i'r Dyfroedd | J. Morgan Lloyd | verificar derechos | 2 | chubut 2018 comp. 71<br>[pOQSuZMyuaI](https://www.youtube.com/watch?v=pOQSuZMyuaI) [utHSvsjwvwo 7:56:22](https://www.youtube.com/watch?v=utHSvsjwvwo&t=28582s) | texto guardado, sin alinear: el texto no coincide con lo que se canta |
| Oro y plata | Homero Manzi / C. J. Pérez, arr. coral Javier Zentner · música Charlo, letra Homero Manzi, versión coral Javier Zentner | verificar derechos | 2 | chubut 2019 comp. 73; chubut 2026 comp. 78<br>✗ [SvBTOh3OlMg 4:25:47](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=15947s) ✅ [hVtD63KLlsw 10:26:18](https://www.youtube.com/watch?v=hVtD63KLlsw&t=37578s) | ✅ 1 de 2 videos; sin alinear en 1: no se canta en ese video |
| Pam Fod Eira yn Wyn? | Dafydd Iwan, trefn. Eirian Williams | verificar derechos | 2 | chubut 2018 comp. 62<br>[TL1bhoNwk4U](https://www.youtube.com/watch?v=TL1bhoNwk4U) [eNmj-1_HlIk 3:48:04](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=13684s) | ✅ alineada |
| Rabo de nube | Silvio Rodríguez, arr. César A. Carrillo | verificar derechos | 2 | chubut 2018 comp. 75<br>[eNmj-1_HlIk 3:26:24](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=12384s) [x0LBSjAuT3Q](https://www.youtube.com/watch?v=x0LBSjAuT3Q) | ✅ alineada |
| Rosa Amarela | Heitor Villalobos | verificar derechos | 2 | chubut 2025 comp. 75<br>✗ [BC61L8txOaQ 8:59:15](https://www.youtube.com/watch?v=BC61L8txOaQ&t=32355s) ✅ [h5zX7SaZJt8](https://www.youtube.com/watch?v=h5zX7SaZJt8) | ✅ 1 de 2 videos; sin alinear en 1: el alineador amontona las líneas |
| Si llega a ser tucumana | Cuchi Leguizamón, v. c. Santiago Búcar | verificar derechos | 2 | chubut 2024 comp. 73<br>[W1z_1ulc_lY](https://www.youtube.com/watch?v=W1z_1ulc_lY) [arqF7QHVMw0 4:27:20](https://www.youtube.com/watch?v=arqF7QHVMw0&t=16040s) | texto guardado, sin alinear: motivo por confirmar |
| Ta na solbici | Samo Vovk | verificar derechos | 2 | chubut 2025 comp. 76<br>[MIW7333GiIY 4:25](https://www.youtube.com/watch?v=MIW7333GiIY&t=265s) [_75BiKuifoQ](https://www.youtube.com/watch?v=_75BiKuifoQ) | ✅ alineada |
| Variaciones sobre la guajira Guantanamera | Joseíto Fernández sobre versos de José Martí, v. c. Electo Silva, adapt. Uru Fischer | verificar derechos | 2 | chubut 2015 comp. 91<br>✗ [LchCtdWJ7o4](https://www.youtube.com/watch?v=LchCtdWJ7o4) ✅ [QNUeHt-okRE](https://www.youtube.com/watch?v=QNUeHt-okRE) | ✅ 1 de 2 videos; sin alinear en 1: el texto no coincide con lo que se canta |
| Y Deryn Pur | trefniant John H. Roberts | verificar derechos | 2 | chubut 2008 comp. 46; chubut 2013<br>✗ [G15eLgDqHsQ](https://www.youtube.com/watch?v=G15eLgDqHsQ) ✅ [KCr6s-bDISA](https://www.youtube.com/watch?v=KCr6s-bDISA) | ✅ 1 de 2 videos; sin alinear en 1: el texto no coincide con lo que se canta |
| Ar Gyfer Heddiw'r Bore | «Caneuon Llafar Gwlad», Roy Saer | verificar derechos | 1 | chubut 2009 comp. 58<br>[HRG106YXyk4](https://www.youtube.com/watch?v=HRG106YXyk4) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Arweiniad | Richard Mills – George Rees | verificar derechos | 1 | chubut 2018 comp. 70<br>[TH9Z5HAgSTg](https://www.youtube.com/watch?v=TH9Z5HAgSTg) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Canción de cuna para despertar a un negrito | C. Isella – N. Guillén | verificar derechos | 1 | chubut 2025 comp. 65<br>[_75BiKuifoQ](https://www.youtube.com/watch?v=_75BiKuifoQ) | ✅ alineada |
| Canto versos | Jorge Fandermole | verificar derechos | 1 | chubut 2026 comp. 54<br>[cDpe89FFjOA 2:39:01](https://www.youtube.com/watch?v=cDpe89FFjOA&t=9541s) | ✅ alineada |
| Coplas para la tejedora | Jorge Fandermole, versión coral de Pablo Roberto | verificar derechos | 1 | chubut 2026 comp. 72<br>[hVtD63KLlsw 1:00:43](https://www.youtube.com/watch?v=hVtD63KLlsw&t=3643s) | ✅ alineada |
| Cortadera, plumerito | serie «Flores argentinas», Carlos Guastavino | verificar derechos | 1 | chubut 2013 comp. 62<br>[fpNpqWUJ5GM](https://www.youtube.com/watch?v=fpNpqWUJ5GM) | ✅ alineada |
| Dyddiau Dyn sydd Fel Glaswelltyn | Thomas Davies | verificar derechos | 1 | chubut 2015 comp. 87<br>[seH9fQCJ2jk](https://www.youtube.com/watch?v=seH9fQCJ2jk) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| El abuelo y el pehuen | Rubén Patagonia, Jeremías Chauque y Fabián Vejar, versión coral Sergio Rodrigo Seballos | verificar derechos | 1 | chubut 2022 comp. 60<br>[txd21BSbm70](https://www.youtube.com/watch?v=txd21BSbm70) | ✅ alineada |
| El buen remedio | C. Montbrum Ocampo y H. Videla Flores, versión coral María del Carmen Aguilar | verificar derechos | 1 | chubut 2026 comp. 79<br>[hVtD63KLlsw 9:53:02](https://www.youtube.com/watch?v=hVtD63KLlsw&t=35582s) | ✅ alineada |
| Gweddi y Pechadur | Morfudd Llwyn Owen | verificar derechos | 1 | chubut 2008 comp. 44<br>[d4K4n-FH7IY](https://www.youtube.com/watch?v=d4K4n-FH7IY) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Gweddi'r Arglwydd | C. Roberts | verificar derechos | 1 | chubut 2022 comp. 67<br>[8SW0TG5gkCI](https://www.youtube.com/watch?v=8SW0TG5gkCI) | ✅ alineada; 1 actuación más sin alinear: el reconocedor galés oyó muy poco |
| Gweddi'r Arglwydd | E. Jones | verificar derechos | 1 | chubut 2022 comp. 67<br>[8SW0TG5gkCI](https://www.youtube.com/watch?v=8SW0TG5gkCI) | ✅ alineada; 1 actuación más sin alinear: el reconocedor galés oyó muy poco |
| Illuxit nobis hodie | Albert Alcaraz | verificar derechos | 1 | chubut 2026 comp. 78<br>[hVtD63KLlsw 10:26:18](https://www.youtube.com/watch?v=hVtD63KLlsw&t=37578s) | ✅ alineada |
| Juana Azurduy | Ariel Ramírez, v. c. Juan Picarel | verificar derechos | 1 | chubut 2024 comp. 65<br>[VDCKHPXzibM 4:43](https://www.youtube.com/watch?v=VDCKHPXzibM&t=283s) | ✅ alineada |
| La finadita | arr. Grupo Vocal Argentino | verificar derechos | 1 | chubut 2024 comp. 63<br>[VDCKHPXzibM 2:32:16](https://www.youtube.com/watch?v=VDCKHPXzibM&t=9136s) | ✅ alineada |
| O llefara addfwyn Iesu | — | verificar derechos | 1 | chubut 2025 comp. 59<br>[_75BiKuifoQ](https://www.youtube.com/watch?v=_75BiKuifoQ) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Pistyll y Llan | — | verificar derechos | 1 | chubut 2025 comp. 43<br>[_75BiKuifoQ](https://www.youtube.com/watch?v=_75BiKuifoQ) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Wrth fynd efo Deio i Dywyn | — | verificar derechos | 1 | chubut 2025 comp. 45<br>[C20iW5Fuac8](https://www.youtube.com/watch?v=C20iW5Fuac8) | texto guardado, sin alinear: el reconocedor galés oyó muy poco |
| Ysbryd Rebeca | Tecwyn Ifan | verificar derechos | 1 | chubut 2026 comp. 65<br>[cDpe89FFjOA 5:32:48](https://www.youtube.com/watch?v=cDpe89FFjOA&t=19968s) | texto guardado, sin alinear: el texto no coincide con lo que se canta |

## Textos guardados fuera de la tabla

Letras de obras «a elección» (o de una de las alternativas del programa) ya identificadas, o de obras cuyo video no llega a una competencia del programa por título ni capítulo. Cada una lleva los videos con su tramo, los que la nombran en el título y los anotados en `data/letras/huecos.json`.

| Obra | Autoría | Programa | Dónde | Estado |
|---|---|---|---|---|
| 'Does destyn gwiw i'm cân (Iddo Ef) | John Blackwell, Alun (1797-1840); tôn Moscow, Felice de Giardini | — | [AEdUFmf6rjw](https://www.youtube.com/watch?v=AEdUFmf6rjw) | texto guardado, sin alinear: el alineador amontona las líneas |
| 'Rwy'n gweld o bell y dydd yn dod | Watkin Hezekiah Williams, Watcyn Wyn (1844-1905) | — | [bYwLD_A8i-A](https://www.youtube.com/watch?v=bYwLD_A8i-A) [omuyPAg3iqo](https://www.youtube.com/watch?v=omuyPAg3iqo) | ✅ alineada |
| Ahicito | Fortunato Juárez / Raly Barrionuevo | Chubut 2014 comp. 47 (obra a elección) | [GmJvkuTeNdc 0:26](https://www.youtube.com/watch?v=GmJvkuTeNdc&t=26s) | ✅ alineada |
| Ámbar Violeta | Fito Páez | Chubut 2018 comp. 50 (obra a elección) | [Tjs4Lw93v5I](https://www.youtube.com/watch?v=Tjs4Lw93v5I) | ✅ alineada |
| An die Musik | Franz Schubert, | — | [VDCKHPXzibM 42:10](https://www.youtube.com/watch?v=VDCKHPXzibM&t=2530s) | ✅ alineada |
| Ar Lan Iorddonen Ddofn | geiriau Evan Evans (Ieuan Glan Geirionydd); tôn Glan Iorddonen | — | [8adzp7KLmAM](https://www.youtube.com/watch?v=8adzp7KLmAM) | ✅ alineada |
| Ave verum corpus | Francis Poulenc (FP 154, 1952); texto: himno eucarístico latino (siglo XIV), solo la primera estrofa | — | [3xwfWIxGxTI 0:25](https://www.youtube.com/watch?v=3xwfWIxGxTI&t=25s) | ✅ alineada |
| Baguala del Viento | Magdalena Matthey | Chubut 2013 comp. 51 (obra a elección) | [gu761qYfevg 0:12](https://www.youtube.com/watch?v=gu761qYfevg&t=12s) | ✅ alineada |
| Bonita rama de sauce | Carlos Guastavino; texto de Arturo Vázquez | — | ✗ [BC61L8txOaQ 9:00:55](https://www.youtube.com/watch?v=BC61L8txOaQ&t=32455s) ✅ [h5zX7SaZJt8 1:35](https://www.youtube.com/watch?v=h5zX7SaZJt8&t=95s) | ✅ 1 de 2 videos; sin alinear en 1: el alineador amontona las líneas |
| Cachilo dormido | Atahualpa Yupanqui, versión coral de Joaquín Martínez Dávila | — | [cDpe89FFjOA](https://www.youtube.com/watch?v=cDpe89FFjOA) | texto guardado, sin alinear: motivo por confirmar |
| Caed baban bach mewn preseb (Drosom ni) | Howell Elvet Lewis, Elfed (1860-1953) | — | [rSrdEUTAZmU](https://www.youtube.com/watch?v=rSrdEUTAZmU) | ✅ alineada |
| Calon Lân | Daniel James, Gwyrosydd (1847-1920); tôn John Hughes | — | ✗ [5GtsoF0bSDI](https://www.youtube.com/watch?v=5GtsoF0bSDI) ✗ [9AI3KjdxQ0g](https://www.youtube.com/watch?v=9AI3KjdxQ0g) ✗ [C20iW5Fuac8 19:06](https://www.youtube.com/watch?v=C20iW5Fuac8&t=1146s) ✗ [ojLWWOfFWW8 0:05](https://www.youtube.com/watch?v=ojLWWOfFWW8&t=5s) +1 más | ✅ 1 de 5 videos; sin alinear en 4: el texto no coincide con lo que se canta; el reconocedor galés oyó muy poco; los reconocedores oyeron muy poco del canto |
| Canto al Río Uruguay | Ramón Ayala | Chubut 2009 comp. 60 (obra a elección) | [KTNvEcE5bNs](https://www.youtube.com/watch?v=KTNvEcE5bNs) | ✅ alineada |
| De quien pagó mi redención | Himno, anónimo | — | [HnVmmnyjBU4](https://www.youtube.com/watch?v=HnVmmnyjBU4) [utHSvsjwvwo 5:24:50](https://www.youtube.com/watch?v=utHSvsjwvwo&t=19490s) | texto guardado, sin alinear: se canta sin una estrofa |
| Desarma y Sangra | Charly Garcia / Serú Giran | Chubut 2026 comp. 56 (obra a elección) | [cDpe89FFjOA 2:00:23](https://www.youtube.com/watch?v=cDpe89FFjOA&t=7223s) | ✅ alineada |
| Desencuentro | Aníbal Troilo, letra de Cátulo Castillo | Chubut 2026 comp. 55 (obra a elección) | [hVtD63KLlsw 6:47:52](https://www.youtube.com/watch?v=hVtD63KLlsw&t=24472s) | ✅ alineada |
| Duw mawr y rhyfeddodau maith | Samuel Davies (Great God of wonders); versión galesa de John R. Jones, Ramoth (1765-1822) y Joseph Harris, Gomer (1773-1825), 1805 | — | ✅ [INXpTIIfi5c](https://www.youtube.com/watch?v=INXpTIIfi5c) ✗ [cCrdI-dzfZQ](https://www.youtube.com/watch?v=cCrdI-dzfZQ) ✗ [eYr4bFtriWw 1:55](https://www.youtube.com/watch?v=eYr4bFtriWw&t=115s) | ✅ 1 de 3 videos; sin alinear en 2: se canta sin una estrofa |
| Dyma gariad fel y moroedd | William Rees, Gwilym Hiraethog (1802-1883) | — | [P1UDkhDczBA 0:46](https://www.youtube.com/watch?v=P1UDkhDczBA&t=46s) | ✅ alineada |
| Hark, hark! the lark | William Shakespeare (Cymbeline, II.3); música de Franz Schubert (Ständchen, D 889) | — | [7XosfJ41KsI](https://www.youtube.com/watch?v=7XosfJ41KsI) | ✅ alineada |
| Hen Ferchetan | Tradicional galesa | — | ✅ [DW0s3oGilUo](https://www.youtube.com/watch?v=DW0s3oGilUo) ✅ [QnmtSgOvFKM](https://www.youtube.com/watch?v=QnmtSgOvFKM) ✗ [cNJvd6c6B4E](https://www.youtube.com/watch?v=cNJvd6c6B4E) ✅ [eviefVEVksk](https://www.youtube.com/watch?v=eviefVEVksk) +1 más | ✅ 4 de 5 videos; sin alinear en 1: el alineador amontona las líneas |
| Hen Wlad fy Nhadau | Evan James (1809-1878); música de James James | — | [mU3n3wyWRPY](https://www.youtube.com/watch?v=mU3n3wyWRPY) | ✅ alineada |
| Hiraeth | Tradicional galesa (recogida en Môn por J. Lloyd Williams) | — | [-xFt_5ZLcLk](https://www.youtube.com/watch?v=-xFt_5ZLcLk) | ✅ alineada |
| La tristecita | Ariel Ramírez, letra de María Elena Espiro | Chubut 2012 comp. 45 (obra a elección) | [QuOfBRbUpKQ 1:15](https://www.youtube.com/watch?v=QuOfBRbUpKQ&t=75s) | ✅ alineada |
| Mawr oedd Crist yn nhragwyddoldeb | Titus Lewis (1773-1811) y Casgliad D. Jones 1810 (atribuido también a Thomas Lewis) | — | ✗ [Z_QPMRk-ek0](https://www.youtube.com/watch?v=Z_QPMRk-ek0) ✅ [biKtvTMA3_Q 0:30](https://www.youtube.com/watch?v=biKtvTMA3_Q&t=30s) | ✅ 1 de 2 videos; sin alinear en 1: se canta sin una estrofa |
| Mi glywaf dyner lais (Arglwydd, dyma fi) | Lewis Hartsough (I hear thy welcome voice); versión galesa de John Roberts, Ieuan Gwyllt (1822-1877); tôn Gwahoddiad | — | [J3-drpsAHnU 1:40](https://www.youtube.com/watch?v=J3-drpsAHnU&t=100s) [wjYvCn8uVms](https://www.youtube.com/watch?v=wjYvCn8uVms) [x4u77VKMhak](https://www.youtube.com/watch?v=x4u77VKMhak) | texto guardado, sin alinear: el reconocedor galés oyó muy poco; el alineador amontona las líneas |
| Molwn enw'r Arglwydd | John James Williams (1869-1954) | — | ✅ [8IQJGDgLfBQ](https://www.youtube.com/watch?v=8IQJGDgLfBQ) ✗ [sV0n9xD1M_8](https://www.youtube.com/watch?v=sV0n9xD1M_8) | ✅ 1 de 2 videos; sin alinear en 1: se canta sin una estrofa |
| Naranjo en Flor | — | Chubut 2018 comp. 49 (obra a elección) | [9zK9cjhalec 0:40](https://www.youtube.com/watch?v=9zK9cjhalec&t=40s) [utHSvsjwvwo 5:48:47](https://www.youtube.com/watch?v=utHSvsjwvwo&t=20927s) | ✅ alineada |
| Ombra mai fu | George Frideric Handel (Serse, 1738); texto de Silvio Stampiglia, según Nicolò Minato | — | [tsVIG-OErCo 0:28](https://www.youtube.com/watch?v=tsVIG-OErCo&t=28s) | ✅ alineada |
| Quel fior che all'alba ride | Georg Friedrich Händel, dueto HWV 192 (1741); texto italiano anónimo | — | [b8-YOLtDus4 0:25](https://www.youtube.com/watch?v=b8-YOLtDus4&t=25s) | ✅ alineada |
| Ríe Chinito | Perotá Chingó | Chubut 2026 comp. 61 (obra a elección) | [hVtD63KLlsw 8:44:40](https://www.youtube.com/watch?v=hVtD63KLlsw&t=31480s) | ✅ alineada |
| Rumbo al cerro | Alejandro Maldino / Mario Díaz | Chubut 2012 comp. 45 (obra a elección) | [Fkm05yVVzBY 0:30](https://www.youtube.com/watch?v=Fkm05yVVzBY&t=30s) | texto guardado, sin alinear: motivo por confirmar |
| Salve Regina | Antífona mariana (atribuida a Hermann Contractus, s. XI); música de autor no identificado | — | [jNt92b9X0M0 0:12](https://www.youtube.com/watch?v=jNt92b9X0M0&t=12s) | texto guardado, sin alinear: el alineador amontona las líneas |
| The Seal Lullaby | Eric Whitacre; texto de Rudyard Kipling («Seal Lullaby», The Jungle Book, 1894) | — | [-RHKtM1HWnc 0:46](https://www.youtube.com/watch?v=-RHKtM1HWnc&t=46s) [_Ik8mz8FDnE 0:35](https://www.youtube.com/watch?v=_Ik8mz8FDnE&t=35s) [vLZRPAHHh8k 0:48](https://www.youtube.com/watch?v=vLZRPAHHh8k&t=48s) | ✅ alineada |
| Tuag adref 'r wyf yn teithio | Owen Rhys Owen (1854-1908); tôn Regent Square, Henry Smart | — | [ryen1FgSQXQ 0:17](https://www.youtube.com/watch?v=ryen1FgSQXQ&t=17s) | ✅ alineada |
| Yr Iesu'n ddigon (cerdd dant) | William Williams, Pantycelyn (1717-1791): tres estrofas de un himno y una de otro, en el orden en que se cantan | — | [tzkyy9DDn2o](https://www.youtube.com/watch?v=tzkyy9DDn2o) | ✅ alineada |
| Zamba negra | Mavi Díaz y Las Folkies | Chubut 2018 comp. 48 (obra a elección) | [xO9Sdkfw1bo 0:09](https://www.youtube.com/watch?v=xO9Sdkfw1bo&t=9s) | ✅ alineada |
| Zamba para olvidar | Daniel Toro y Julio César Bissio | — | [0KGzTyN3mjc 0:40](https://www.youtube.com/watch?v=0KGzTyN3mjc&t=40s) [s-eVxB-tOIo 0:18](https://www.youtube.com/watch?v=s-eVxB-tOIo&t=18s) | ✅ alineada |

## Obras identificadas, sin texto

Actuaciones «a elección» (o sin competencia) cuya obra ya se sabe, por el anuncio, el título o lo que se oye (`data/letras/identificaciones.json`), pero que no tienen texto guardado: siguen siendo un hueco de «falta el texto». Con derechos, el texto lo da el mantenedor; de dominio público, puede venir de una fuente pública citada (skill `video-lyrics`).

| Obra | Autoría | Derechos | Confianza | Dónde | Evidencia |
|---|---|---|---|---|---|
| Aberdaron | Cynan (1895-1970); música de Meirion Williams | con derechos | media | [RXHTDhpgFeI](https://www.youtube.com/watch?v=RXHTDhpgFeI) | El programa pide una obra de Meirion Williams y el reconocedor galés oye la canción. |
| An Irish Blessing (arreglo sin identificar) | bendición tradicional irlandesa; compositor no identificado | derechos sin confirmar | media | [4DWCOQ_d42g 0:30](https://www.youtube.com/watch?v=4DWCOQ_d42g&t=30s) (sin texto publicado) | El título del video la nombra y los reconocedores oyen la bendición. La segunda estrofa no es la bendición tradicional: parece de un arreglo moderno. |
| Ave verum corpus (arreglo sin identificar) | himno eucarístico latino; música de autor no identificado | dominio público | media | [5H0rNCosoSk 0:20](https://www.youtube.com/watch?v=5H0rNCosoSk&t=20s) (sin texto publicado) | El título del video la nombra y Whisper oye partes del himno. El arreglo no está identificado: lo que se oye no coincide del todo con la variante guardada para otro arreglo y sigue una coda; no hay texto hasta saber qué arreglo es. |
| Azúcar, pimienta y sal | — | con derechos | media | [gSPQrw2jxTI 0:10](https://www.youtube.com/watch?v=gSPQrw2jxTI&t=10s) | El título del video la nombra y Whisper oye el estribillo. Autor sin confirmar. |
| Bring Him Home (Les Misérables) | Claude-Michel Schönberg; letra en inglés de Herbert Kretzmer | con derechos | alta | [IEDbMUkzDYs](https://www.youtube.com/watch?v=IEDbMUkzDYs) (sin texto publicado) | Los reconocedores oyen la canción en inglés. |
| Cant a Hanner | letra anunciada como de Nantlais Evans; tôn Llanuwchllyn | con derechos | media | [QHT2dhP9mDI 0:20](https://www.youtube.com/watch?v=QHT2dhP9mDI&t=20s) | La cantante anuncia la letra y la tonada; el reconocedor galés oye la canción, escrita para los 150 años de la colonia. El autor sale solo del anuncio y no está confirmado. |
| Colli Iaith | Harri Webb (1920-1994), 1966; música de Meredydd Evans | con derechos | alta | [0qqaiN722C0](https://www.youtube.com/watch?v=0qqaiN722C0) | El reconocedor galés oye la canción; los autores se confirmaron en la web. |
| Como la cigarra | María Elena Walsh | con derechos | alta | [fBuwFDzNr4E 16:40](https://www.youtube.com/watch?v=fBuwFDzNr4E&t=1000s) | Comp. 49, homenaje a María Elena Walsh: Whisper oye el estribillo tres veces. |
| Doña Ubenza (carnavalito) | Chacho Echenique | con derechos | media | [k14zxxGpcV0 0:08](https://www.youtube.com/watch?v=k14zxxGpcV0&t=8s) | El título del video la nombra. Las coplas que oyó Whisper no se cotejaron con esa canción. |
| Ffarwél i Stesion Strata | probablemente Tecwyn Ifan | con derechos | media | [77ryTxS6J0Q](https://www.youtube.com/watch?v=77ryTxS6J0Q) | El título del video la nombra y el reconocedor galés oye el estribillo. Otro programa (Chubut 2022, comp. 55) acredita una obra del mismo título a Tecwyn Ifan; raro en una competencia de himnos. |
| Grito santiagueño | Jacinto Piedra | con derechos | alta | [ZiTKAU44dr4 0:30](https://www.youtube.com/watch?v=ZiTKAU44dr4&t=30s) [x8RR_Qe4sSA 0:30](https://www.youtube.com/watch?v=x8RR_Qe4sSA&t=30s) | El título del video la nombra y Whisper oye la canción. El locutor la anuncia y Whisper oye la canción. |
| Hallelujah | Leonard Cohen | con derechos | alta | [LZPnp7YyOQY 0:30](https://www.youtube.com/watch?v=LZPnp7YyOQY&t=30s) | El título del video la nombra y se oye el estribillo. |
| Hay un canto en mi alma hoy | — | derechos sin confirmar | baja | [tHqnCKQuHdw](https://www.youtube.com/watch?v=tHqnCKQuHdw) | Whisper oye el himno; un cancionero en archive.org tiene esos versos sin título ni autor. Título y autor sin confirmar. |
| La grata nueva escucha hoy (Ven a Cristo) | John H. Stockton (1813-1877); traducción de H. G. Jackson (1838-1914) | dominio público | media | [5G_NHhXz3fo](https://www.youtube.com/watch?v=5G_NHhXz3fo) | Whisper oye el himno; hymnary.org da el autor y el traductor. No se pudo bajar una fuente digital del texto (hymnary.org bloquea la descarga automática). |
| La última curda | Aníbal Troilo; letra de Cátulo Castillo | con derechos | alta | [ePtCfKzpd2U 0:20](https://www.youtube.com/watch?v=ePtCfKzpd2U&t=20s) [z2674igx7I0 0:20](https://www.youtube.com/watch?v=z2674igx7I0&t=20s) | El título del video la nombra y Whisper oye el tango. Whisper oye el tango. |
| Mein Herr Marquis (Die Fledermaus) | Johann Strauss II; libreto de Carl Haffner y Richard Genée | dominio público | media | [2uELnKwPGfo 0:30](https://www.youtube.com/watch?v=2uELnKwPGfo&t=30s) | El título del video la nombra; el reconocedor galés oye la canción de la risa en alemán. No se obtuvo un libreto digital fiable para cotejar. |
| Mi luna cautiva | Chango Rodríguez | con derechos | alta | [5W8lfQJNmcA 0:20](https://www.youtube.com/watch?v=5W8lfQJNmcA&t=20s) | La anuncian con su autor y Whisper oye la canción. |
| Open thou mine eyes | John Rutter; texto según Lancelot Andrewes (Preces privatae) | derechos sin confirmar | alta | [8SOiU_lopa0](https://www.youtube.com/watch?v=8SOiU_lopa0) (sin texto publicado) | El título del video la nombra y se oye el texto en inglés. La oración de Andrewes es de dominio público, pero no se encontró la fuente de la redacción inglesa que usa Rutter. |
| Paid â deud | tonada tradicional; autor de estas palabras sin confirmar | derechos sin confirmar | media | [26IzyQkuOCI](https://www.youtube.com/watch?v=26IzyQkuOCI) [5bvgxlW38jw](https://www.youtube.com/watch?v=5bvgxlW38jw) | El título del video la nombra y el reconocedor galés oye el estribillo. No se sabe si las palabras son tradicionales. El reconocedor galés oye el estribillo. No se sabe si las palabras son tradicionales. |
| Pétalo de sal | Fito Páez y Luis Alberto Spinetta | con derechos | alta | [uBo5bZPuCJk 0:10](https://www.youtube.com/watch?v=uBo5bZPuCJk&t=10s) | La anuncian en la sesión eNmj-1_HlIk y Whisper oye la canción. |
| Santiano (versión galesa) | tonada de saloma marinera; autor de la letra galesa no identificado | derechos sin confirmar | media | [9EO6zk3LqAk](https://www.youtube.com/watch?v=9EO6zk3LqAk) | El título del video la nombra y el reconocedor galés oye la letra galesa. |
| Si hei lwli 'mabi | canción de cuna tradicional galesa | dominio público | alta | [D39FKqeFJeg](https://www.youtube.com/watch?v=D39FKqeFJeg) | El reconocedor galés oye la canción. La única fuente hallada (O. M. Edwards, Yr Hwiangerddi) tiene solo la primera cuarteta y se cantan más versos. |
| Trwy'r Drysni | canción tradicional galesa | dominio público | alta | [ISN-Qjkt8Lk 0:30](https://www.youtube.com/watch?v=ISN-Qjkt8Lk&t=30s) | El título del video la nombra y el reconocedor galés oye las estrofas. No se encontró una fuente digital del texto. |
| Yr afon a lifodd rhwng nefoedd a llawr | William Williams, Pantycelyn (1717-1791), según gobaith.cymru | dominio público | alta | [83Ju-97Zndg](https://www.youtube.com/watch?v=83Ju-97Zndg) | El reconocedor galés y Whisper oyen el himno entero. La versión que se canta difiere en cuatro de sus doce versos de las cinco que publica gobaith.cymru: no hay texto guardado hasta tener el que se canta. |
| Yuyo verde | Domingo Federico; letra de Homero Expósito | con derechos | alta | [rCj9gEkRwxo 0:14](https://www.youtube.com/watch?v=rCj9gEkRwxo&t=14s) | El título del video la nombra y Whisper oye el tango. |
| Zamba de Juan Panadero | Cuchi Leguizamón; letra de Manuel J. Castilla | con derechos | alta | [Xvh01H_O9iY 0:07](https://www.youtube.com/watch?v=Xvh01H_O9iY&t=7s) | La cantante la anuncia con sus autores y Whisper oye la zamba. |
| Zamba de usted | Ariel Ramírez; letra de Félix Luna | con derechos | media | [GJbGEB4UWao 0:30](https://www.youtube.com/watch?v=GJbGEB4UWao&t=30s) | La cantante la presenta con sus autores; del canto se oye muy poco. |

## Obras en videos sin texto publicado

Competencias cantadas del programa (y obras con texto guardado que el título nombra) cuyos videos todavía no tienen texto publicado: entran en la tabla de arriba cuando lo tengan.

| Edición | Comp. | Programa | Video |
|---|---|---|---|
| chubut 2008 | 51 | Unawd cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd. | [ucQRWWEnYgA](https://www.youtube.com/watch?v=ucQRWWEnYgA) |
| chubut 2009 | 53 | Solo mezzosoprano: «Ombra mai fu» (de «Xerxes»), George F. Haendel. | [tsVIG-OErCo](https://www.youtube.com/watch?v=tsVIG-OErCo) |
| chubut 2009 | 89 | Coro femenino: «Ave verum corpus», Francis Poulenc. | [3xwfWIxGxTI](https://www.youtube.com/watch?v=3xwfWIxGxTI) |
| chubut 2013 | 39 | Unawd i ferched: «Awelon y Mynydd», Meirion Williams. | [Nt2ahYfRCZM](https://www.youtube.com/watch?v=Nt2ahYfRCZM) |
| chubut 2013 | 39 | Unawd i ferched: «Awelon y Mynydd», Meirion Williams. | [sYx4h5y6nSA](https://www.youtube.com/watch?v=sYx4h5y6nSA) |
| chubut 2013 | 52 | Trío: «Claros y frescos ríos», anónimo siglo XVI. | [95yFZUG64Zg](https://www.youtube.com/watch?v=95yFZUG64Zg) |
| chubut 2013 | 53 | Octeto: «Ciego quisiera haber sido», Carlos Guastavino – Eduardo Falú. | [vcGqblxiRUk](https://www.youtube.com/watch?v=vcGqblxiRUk) |
| chubut 2013 | 71 | Coro de formación libre: obra contemporánea original a elección, a capella o con acompañamiento original. | [DeuDFZOaHdI](https://www.youtube.com/watch?v=DeuDFZOaHdI) |
| chubut 2013 | 71 | Coro de formación libre: obra contemporánea original a elección, a capella o con acompañamiento original. | [abaphKoAWAA](https://www.youtube.com/watch?v=abaphKoAWAA) |
| chubut 2014 | 46 | Solo libre: aria u obra de autor académico a elección. | [xmwFe9AKPvw](https://www.youtube.com/watch?v=xmwFe9AKPvw) |
| chubut 2014 | 52 | Pedwarawd i ferched, dynion neu gymysg: hunanddewisiad. | [7FR1Lmj0_xs](https://www.youtube.com/watch?v=7FR1Lmj0_xs) |
| chubut 2014 | 54 | Cuarteto: himno a elección. | [4DWCOQ_d42g](https://www.youtube.com/watch?v=4DWCOQ_d42g) |
| chubut 2014 | 54 | Cuarteto: himno a elección. | [5H0rNCosoSk](https://www.youtube.com/watch?v=5H0rNCosoSk) |
| chubut 2014 | 54 | Cuarteto: himno a elección. | [YCM8FtFwwws](https://www.youtube.com/watch?v=YCM8FtFwwws) |
| chubut 2014 | 56 | Parti neu gôr merched: «Boneddwr Mawr o'r Bala», trefn. Megan Morris. | [do52Cw_wHRw](https://www.youtube.com/watch?v=do52Cw_wHRw) |
| chubut 2014 | 63 | Conjunto vocal con ensamble instrumental hasta 16 integrantes: obra del Renacimiento a elección. | [sh9SSdlighQ](https://www.youtube.com/watch?v=sh9SSdlighQ) |
| chubut 2015 | 54 | Unawd i ferched: «Blodau ger y Drws», Meirion Williams. | [nAlfKxQFP6E](https://www.youtube.com/watch?v=nAlfKxQFP6E) |
| chubut 2015 | 59 | Unawd cerdd dant: hunanddewisiad. | [WKDDVbzzQyA](https://www.youtube.com/watch?v=WKDDVbzzQyA) |
| chubut 2015 | 60 | Solo libre: aria u obra original académica del repertorio universal a elección. | [W9nrFrEkJ8Q](https://www.youtube.com/watch?v=W9nrFrEkJ8Q) |
| chubut 2015 | 63 | Solo libre: música blues o jazz a elección. | [9zAxsRQbJJU](https://www.youtube.com/watch?v=9zAxsRQbJJU) |
| chubut 2015 | 63 | Solo libre: música blues o jazz a elección. | [WFk8K8aa0PQ](https://www.youtube.com/watch?v=WFk8K8aa0PQ) |
| chubut 2015 | 66 | Pedwarawd: «Sigl-Gân», J. Brahms, trefn. W. S. Gwynn Williams. | [gFNc_TUTuro](https://www.youtube.com/watch?v=gFNc_TUTuro) |
| chubut 2015 | 72 | Parti hyd 16 mewn nifer: «Daffodils», Mansel Thomas. | [qiPzn3aOn4c](https://www.youtube.com/watch?v=qiPzn3aOn4c) |
| chubut 2015 | 76 | Parti neu gôr capel: hunanddewisiad. | [5YgdY5CmO2I](https://www.youtube.com/watch?v=5YgdY5CmO2I) |
| chubut 2015 | 80 | Conjunto vocal libre con ensamble instrumental: obra del repertorio universal a elección. | [BbQbiGpyIj0](https://www.youtube.com/watch?v=BbQbiGpyIj0) |
| chubut 2015 | 82 | Conjunto femenino: «Ave María», Dante Andreo. | [bQw6r2EV6_Q](https://www.youtube.com/watch?v=bQw6r2EV6_Q) |
| chubut 2015 | 82 | Conjunto femenino: «Ave María», Dante Andreo. | [i76Yv67orw4](https://www.youtube.com/watch?v=i76Yv67orw4) |
| chubut 2015 | 82 | Conjunto femenino: «Ave María», Dante Andreo. | [s96_FOydUmo](https://www.youtube.com/watch?v=s96_FOydUmo) |
| chubut 2015 | 85 | Côr cymysg hyd 30 o leisiau: «Ar Lan Iorddonen Ddofn», C. C. N. | [8adzp7KLmAM](https://www.youtube.com/watch?v=8adzp7KLmAM) |
| chubut 2015 | 92 | Coro de formación libre: obra académica del repertorio universal a elección. | [DijBIYobu9I](https://www.youtube.com/watch?v=DijBIYobu9I) |
| chubut 2015 | 92 | Coro de formación libre: obra académica del repertorio universal a elección. | [HsHFk3tIwC0](https://www.youtube.com/watch?v=HsHFk3tIwC0) |
| chubut 2015 | 92 | Coro de formación libre: obra académica del repertorio universal a elección. | [kvXjplREtvw](https://www.youtube.com/watch?v=kvXjplREtvw) |
| chubut 2015 | 93 | Competencia especial del Sesquicentenario: relato sonoro de temática regional con dos canciones y un poema. | [W1CJlDovGwk](https://www.youtube.com/watch?v=W1CJlDovGwk) |
| chubut 2018 | 65 | Conjunto vocal hasta 12 integrantes con acompañamiento instrumental opcional: «Tu traditora», Orlando de La… | [dGIdePPMtTQ](https://www.youtube.com/watch?v=dGIdePPMtTQ) |
| chubut 2019 | 67 | Conjunto femenino (mínimo 8 integrantes): «The seal lullaby», Eric Whitacre. | [-RHKtM1HWnc](https://www.youtube.com/watch?v=-RHKtM1HWnc) |
| chubut 2019 | 67 | Conjunto femenino (mínimo 8 integrantes): «The seal lullaby», Eric Whitacre. | [_Ik8mz8FDnE](https://www.youtube.com/watch?v=_Ik8mz8FDnE) |
| chubut 2019 | 67 | Conjunto femenino (mínimo 8 integrantes): «The seal lullaby», Eric Whitacre. | [vLZRPAHHh8k](https://www.youtube.com/watch?v=vLZRPAHHh8k) |
| chubut 2023 | 78 | Coro de libre formación: obra con puesta en escena o música de películas. | [uPrIYaSB8vY](https://www.youtube.com/watch?v=uPrIYaSB8vY) |

## Detalle de los huecos documentados

Lo anotado en `data/letras/huecos.json`, por motivo; cada video enlazado es uno sin alinear.

### El texto no coincide con lo que se canta

- «Ar lan y môr» (trefn. D. E. Parry Williams): [pOQSuZMyuaI](https://www.youtube.com/watch?v=pOQSuZMyuaI) [utHSvsjwvwo 7:56:22](https://www.youtube.com/watch?v=utHSvsjwvwo&t=28582s). Se cantan las dos primeras estrofas del texto guardado, después una estrofa que no está en él, y no las otras tres; hace falta el texto tal como lo canta este grupo (utHSvsjwvwo es la misma actuación que el clip pOQSuZMyuaI y además no tiene fuente en galés).
- «Calon Lân» (Daniel James, Gwyrosydd (1847-1920); tôn John Hughes): [5GtsoF0bSDI](https://www.youtube.com/watch?v=5GtsoF0bSDI). Se canta una tercera estrofa que no está en el texto guardado (Trevelin 2014, versión original a capella).
- «Calon Lân» (Daniel James, Gwyrosydd (1847-1920); tôn John Hughes): [9AI3KjdxQ0g](https://www.youtube.com/watch?v=9AI3KjdxQ0g). Una de las estrofas se canta en castellano, en una traducción que no está guardada (una traducción tiene sus propios derechos).
- «O bone Jesu – Lux Aeterna» (Fernando Moruja; texto litúrgico latino (solo la primera parte, «O bone Jesu»)): [BC61L8txOaQ 10:17:56](https://www.youtube.com/watch?v=BC61L8txOaQ&t=37076s). El texto guardado tiene solo la primera parte de la obra, ya alineada; la segunda, Lux aeterna (de 10:17:56 a 10:19:30), no tiene texto, porque no se pudo confirmar qué palabras usa esta obra.
- «O! Deuwch i'r Dyfroedd» (J. Morgan Lloyd): [pOQSuZMyuaI](https://www.youtube.com/watch?v=pOQSuZMyuaI) [utHSvsjwvwo 7:56:22](https://www.youtube.com/watch?v=utHSvsjwvwo&t=28582s). El texto guardado parece ser el de otro himno de título parecido: casi nada de lo que se oye cantar está en él (utHSvsjwvwo contiene la misma actuación que el clip pOQSuZMyuaI), así que hay que revisar la fuente.
- «Variaciones sobre la guajira Guantanamera» (Joseíto Fernández sobre versos de José Martí, v. c. Electo Silva, adapt. Uru Fischer): [LchCtdWJ7o4](https://www.youtube.com/watch?v=LchCtdWJ7o4). El texto guardado tiene solo una de las cuatro estrofas de Martí que usa el arreglo (las otras no se identificaron) y no el estribillo, que tiene derechos; en este video esa estrofa no se oyó.
- «Y Deryn Pur» (Tradicional galesa (colección de Miss Williams, Aberpergwm)): [G15eLgDqHsQ](https://www.youtube.com/watch?v=G15eLgDqHsQ). El arreglo de John H. Roberts que se canta en este clip (Chubut 2008, comp. 46) usa otras palabras que el texto tradicional guardado, que es el que se canta en KCr6s-bDISA.
- «Ysbryd Rebeca» (Tecwyn Ifan): [cDpe89FFjOA 5:32:48](https://www.youtube.com/watch?v=cDpe89FFjOA&t=19968s). El texto guardado tiene solo el estribillo, que vuelve unas tres veces entre estrofas que no están en él; además el video no tiene fuente en galés.

### Motivo por confirmar

- «Cachilo dormido» (Atahualpa Yupanqui, versión coral de Joaquín Martínez Dávila): [cDpe89FFjOA](https://www.youtube.com/watch?v=cDpe89FFjOA). El mantenedor la dejó afuera el 2026-11-21 sin anotar por qué (Chubut 2026, comp. 71): falta confirmar si el texto guardado no coincide con lo que se canta o si la obra no está en la sesión. Además, a los marcadores de la sesión les falta el capítulo de esa competencia, por eso la obra no aparece en la tabla del programa.
- «Rumbo al cerro» (Alejandro Maldino / Mario Díaz): [Fkm05yVVzBY 0:30](https://www.youtube.com/watch?v=Fkm05yVVzBY&t=30s). El mantenedor la dejó afuera el 2026-11-21; una pasada anterior no encontró la actuación en el clip (Chubut 2012, comp. 45, obra a elección), y la pasada de identificación del 2026-11-23 sí la reconoce por lo que se oye: falta confirmar si el texto no coincide o si hay otro motivo.
- «Si llega a ser tucumana» (Cuchi Leguizamón, v. c. Santiago Búcar): [W1z_1ulc_lY](https://www.youtube.com/watch?v=W1z_1ulc_lY) [arqF7QHVMw0 4:27:20](https://www.youtube.com/watch?v=arqF7QHVMw0&t=16040s). El mantenedor la dejó afuera el 2026-11-21 sin anotar por qué: falta confirmar si el texto guardado no coincide con lo que se canta en estos videos o si la obra no está en ellos.

### Se canta sin una estrofa

- «De quien pagó mi redención» (Himno, anónimo): [HnVmmnyjBU4](https://www.youtube.com/watch?v=HnVmmnyjBU4) [utHSvsjwvwo 5:24:50](https://www.youtube.com/watch?v=utHSvsjwvwo&t=19490s). Chubut 2018, comp. 55 (himno a elección): el cuarteto canta las estrofas 1, 3 y 4 y saltea la 2 (la sesión, hacia 5:24:50, tiene la misma actuación que el clip), y el alineador todavía no puede saltear una estrofa.
- «Duw mawr y rhyfeddodau maith» (Samuel Davies (Great God of wonders); versión galesa de John R. Jones, Ramoth (1765-1822) y Joseph Harris, Gomer (1773-1825), 1805): [cCrdI-dzfZQ](https://www.youtube.com/watch?v=cCrdI-dzfZQ) [eYr4bFtriWw 1:55](https://www.youtube.com/watch?v=eYr4bFtriWw&t=115s). Se canta solo la primera de las tres estrofas guardadas, con su estribillo (en cCrdI-dzfZQ, el estribillo dos o tres veces; en eYr4bFtriWw, Chubut 2022 comp. 66, con la tonada Huddersfield, de 1:55 a 3:25).
- «Huddersfield»: [eYr4bFtriWw 1:55](https://www.youtube.com/watch?v=eYr4bFtriWw&t=115s). El coro canta esta tonada con las palabras de «Duw mawr y rhyfeddodau maith», ya guardadas (duw-mawr-y-rhyfeddodau), pero solo la primera estrofa y su estribillo (de 1:55 a 3:25); el segundo coro de la competencia no está en los videos.
- «Mawr oedd Crist yn nhragwyddoldeb» (Titus Lewis (1773-1811) y Casgliad D. Jones 1810 (atribuido también a Thomas Lewis)): [Z_QPMRk-ek0](https://www.youtube.com/watch?v=Z_QPMRk-ek0). El solista (Chubut 2008, comp. 48, himno a elección) canta las estrofas 1 y 3 y saltea la 2, y el alineador todavía no puede saltear una estrofa.
- «Molwn enw'r Arglwydd» (John James Williams (1869-1954)): [sV0n9xD1M_8](https://www.youtube.com/watch?v=sV0n9xD1M_8). Se cantan la primera y la tercera estrofa del texto guardado (la 1 y la 4 del himno) y se saltea la segunda; 8IQJGDgLfBQ canta las tres y ya está alineado.

### El reconocedor galés oyó muy poco

- «Angor» (Tudur Huws Jones): [Fh7i29-94XY](https://www.youtube.com/watch?v=Fh7i29-94XY). El reconocedor galés oye la obra, pero casi todas sus líneas quedan bajo el filtro de confianza y el final del texto se amontona en pocos segundos.
- «Angor» (Tudur Huws Jones): [L6FSD_iI5ew](https://www.youtube.com/watch?v=L6FSD_iI5ew). El video no tiene fuente en galés y lo que oyó YouTube no sirve para ubicar las líneas; la obra se identifica solo por el título (comp. 58) y parece otro grupo con el mismo arreglo.
- «Ar gyfer heddiw'r bore» (carol traddodiadol, Eos Iâl): [-ENPPYxWGbw](https://www.youtube.com/watch?v=-ENPPYxWGbw) [3q3bZtuLbzo](https://www.youtube.com/watch?v=3q3bZtuLbzo) [HRG106YXyk4](https://www.youtube.com/watch?v=HRG106YXyk4) [RFm_ZuU6Zo8](https://www.youtube.com/watch?v=RFm_ZuU6Zo8). Todavía no se intentó alinear: quedó para después de la pasada del modelo galés, porque con las fuentes actuales el canto en galés casi no se reconoce.
- «Aros mae'r Mynyddau Mawr» (Meirion Williams; geiriau Ceiriog (o «Alun Mabon»)): [bnN5qk4QWVQ](https://www.youtube.com/watch?v=bnN5qk4QWVQ). Los primeros versos quedan apenas debajo del filtro de confianza del reconocedor galés (de 0:00 a 0:43), así que las tres primeras líneas se juntan en 0:43, unos treinta segundos tarde.
- «Arweiniad» (tôn Richard Mills; geiriau George Rees (1873-1950)): [TH9Z5HAgSTg](https://www.youtube.com/watch?v=TH9Z5HAgSTg). La primera estrofa queda debajo del filtro de confianza del reconocedor galés (lo primero que pasa es la segunda, hacia 0:49), así que se corre casi un minuto, y la última se amontona en tres segundos.
- «Calon Lân» (Daniel James, Gwyrosydd (1847-1920); tôn John Hughes): [ojLWWOfFWW8 0:05](https://www.youtube.com/watch?v=ojLWWOfFWW8&t=5s). Casi todo el canto queda debajo del filtro de confianza del reconocedor galés: lo primero que pasa es hacia 1:16, y el texto entero se amontona en dieciséis segundos.
- «Cwm Rhondda» (tôn John Hughes; geiriau Ann Griffiths (1776-1805)): [NQev8Jjs3mo](https://www.youtube.com/watch?v=NQev8Jjs3mo). De la primera mitad del clip no pasa nada el filtro de confianza del reconocedor galés (lo primero es el estribillo de la segunda estrofa, hacia 1:29), así que las primeras estrofas se amontonan; falta saber además si el coro canta la primera.
- «Dyddiau Dyn sydd Fel Glaswelltyn» (Thomas Davies; geiriau Salm 103:15–17 (Beibl 1620)): [seH9fQCJ2jk](https://www.youtube.com/watch?v=seH9fQCJ2jk). El primer versículo, que se canta de 0:00 a 1:00, queda debajo del filtro de confianza del reconocedor galés, y las primeras líneas se corren hasta un minuto.
- «Eiddot Ti, O Dduw, yw y Mawredd»: [6bEQQTDyMqY](https://www.youtube.com/watch?v=6bEQQTDyMqY) [ATN6kZ86h8s](https://www.youtube.com/watch?v=ATN6kZ86h8s). Todavía no se intentó alinear: quedó para después de la pasada del modelo galés, porque con las fuentes actuales el canto en galés casi no se reconoce.
- «Gweddi y Pechadur» (Morfudd Llwyn Owen): [d4K4n-FH7IY](https://www.youtube.com/watch?v=d4K4n-FH7IY). Todavía no se intentó alinear: quedó para después de la pasada del modelo galés, porque con las fuentes actuales el canto en galés casi no se reconoce.
- «Gweddi'r Arglwydd» (Mathew 6:9–13 (Beibl 1620); gosodiadau C. Roberts ac E. Jones): [8SW0TG5gkCI 2:58](https://www.youtube.com/watch?v=8SW0TG5gkCI&t=178s). El arreglo b), de E. Jones (de 2:58 a 5:25), sigue sin alinear: su primera mitad queda debajo del filtro de confianza del reconocedor galés y las cuatro primeras líneas se juntarían en 3:56; el arreglo a), de C. Roberts, ya está alineado.
- «Mi glywaf dyner lais (Arglwydd, dyma fi)» (Lewis Hartsough (I hear thy welcome voice); versión galesa de John Roberts, Ieuan Gwyllt (1822-1877); tôn Gwahoddiad): [J3-drpsAHnU 1:40](https://www.youtube.com/watch?v=J3-drpsAHnU&t=100s) [wjYvCn8uVms](https://www.youtube.com/watch?v=wjYvCn8uVms). La primera estrofa (en J3-drpsAHnU, casi todo hasta 1:58) queda debajo del filtro de confianza del reconocedor galés, y las primeras líneas se amontonan en el primer segmento oído.
- «Newyddion braf» (Ron Jones / J. Dafydd – E. Lewys): [nkwfBKiLMIg](https://www.youtube.com/watch?v=nkwfBKiLMIg) [tF_V5HsV-NA](https://www.youtube.com/watch?v=tF_V5HsV-NA). Todavía no se intentó alinear: quedó para después de la pasada del modelo galés, porque con las fuentes actuales el canto en galés casi no se reconoce.
- «O llefara addfwyn Iesu»: [_75BiKuifoQ](https://www.youtube.com/watch?v=_75BiKuifoQ). El anuncio la nombra y el reconocedor galés la oye, pero casi todas sus líneas quedan bajo el filtro de confianza y el texto se amontona en pocos segundos.
- «O nefol addfwyn Oen» (William Williams, Pantycelyn (1717-1791)): [YJnenM8tw0I 1:58](https://www.youtube.com/watch?v=YJnenM8tw0I&t=118s). Dos tríos la cantan en la sesión (Chubut 2025, comp. 53, hacia 1:58 y 4:49): del primero el reconocedor galés oye bien solo la primera estrofa, y del segundo el comienzo queda apenas debajo del filtro de confianza, así que sus tres primeras líneas se juntarían medio minuto tarde.
- «Pistyll y Llan»: [_75BiKuifoQ](https://www.youtube.com/watch?v=_75BiKuifoQ). El anuncio la nombra, pero solo 2 de las 10 líneas que oyó el reconocedor galés pasan el filtro de confianza y más de la mitad del texto se amontona en cuatro segundos.
- «Suo Gân» (Gareth Glyn (Cadwyn); geiriau traddodiadol): [lVJXiosXPo4](https://www.youtube.com/watch?v=lVJXiosXPo4) [ps3CFGC3AfE](https://www.youtube.com/watch?v=ps3CFGC3AfE). La segunda estrofa (y en lVJXiosXPo4 casi toda la obra) queda debajo del filtro de confianza del reconocedor galés y el alineador la amontona en pocos segundos; la obra contrastante que sigue en estos clips no tiene texto.
- «Wrth fynd efo Deio i Dywyn»: [C20iW5Fuac8](https://www.youtube.com/watch?v=C20iW5Fuac8). Todavía no se intentó alinear: quedó para después de la pasada del modelo galés, porque con las fuentes actuales el canto en galés casi no se reconoce.

### Los reconocedores oyeron muy poco del canto

- «Calon Lân» (Daniel James, Gwyrosydd (1847-1920); tôn John Hughes): [C20iW5Fuac8 19:06](https://www.youtube.com/watch?v=C20iW5Fuac8&t=1146s). El título del capítulo la nombra, pero en lo oído no se reconoce: el video termina poco después de la comp. 45, y de 19:06 al final no hay palabras reconocibles.
- «Gurisito» (candombe con percusión corporal, Daniel Viglietti, versión coral Pablo D. Roberto): [FR9inQWeGI8](https://www.youtube.com/watch?v=FR9inQWeGI8). Solo el modelo galés oye algo del canto (de 1:22 a 2:12), y el alineador no lo usa para una obra en castellano; además, después de 3:09 sigue la percusión corporal y no se sabe hasta dónde llega el texto.

### El alineador amontona las líneas

- «'Does destyn gwiw i'm cân (Iddo Ef)» (John Blackwell, Alun (1797-1840); tôn Moscow, Felice de Giardini): [AEdUFmf6rjw](https://www.youtube.com/watch?v=AEdUFmf6rjw). El reconocedor galés oye cada estrofa en un solo segmento y el alineador amontona la segunda en tres segundos (de 0:43 a 0:46).
- «Bonita rama de sauce» (Carlos Guastavino; texto de Arturo Vázquez): [BC61L8txOaQ 9:00:55](https://www.youtube.com/watch?v=BC61L8txOaQ&t=32455s). Chubut 2025, comp. 75, obra a elección (de 9:00:55 a 9:04:00): lo primero que se oye es una estrofa y no las cuatro líneas con que empieza el texto guardado, y el alineador junta esas cuatro en el primer verso oído.
- «Cân yr Arad Goch» (Idris Lewis; geiriau Ceiriog (o «Alun Mabon»)): [0ah0WrQLEa4](https://www.youtube.com/watch?v=0ah0WrQLEa4) [8dpPe64kDpo](https://www.youtube.com/watch?v=8dpPe64kDpo) [N33ihYcQHEk](https://www.youtube.com/watch?v=N33ihYcQHEk). El reconocedor galés oye cada estrofa o estribillo en un solo segmento largo, y el alineador amontona el último estribillo en los cuatro segundos que siguen al último segmento (en 0ah0WrQLEa4 y 8dpPe64kDpo, también el comienzo, que nadie oyó).
- «Claros y frescos ríos» (anónimo siglo XVI): [cBsyeRTrc18](https://www.youtube.com/watch?v=cBsyeRTrc18). Whisper oyó solo dos líneas, al comienzo y en 1:06, y el alineador amontona en la segunda casi todo el resto del texto. Además, 1 video sin texto publicado: [95yFZUG64Zg](https://www.youtube.com/watch?v=95yFZUG64Zg).
- «Como pájaros en el aire» (Peteco Carabajal, arr. Liliana Cangiano): [g3P3_CNOVTk](https://www.youtube.com/watch?v=g3P3_CNOVTk). El canto sigue hasta cerca del final del clip (4:30), pero Whisper oyó solo unas líneas sueltas y, en la segunda mitad, agradecimientos que no se dicen; el alineador amontona las últimas estrofas.
- «Es ist ein Ros' entsprungen» (Michael Praetorius): [3jnNklLlxQ0 28:24](https://www.youtube.com/watch?v=3jnNklLlxQ0&t=1704s) [s07a0VA2zus](https://www.youtube.com/watch?v=s07a0VA2zus). Los dos videos tienen la misma actuación (comp. 54) y el tramo está ubicado, pero los reconocedores oyeron solo palabras sueltas o espurias y el alineador amontona el texto en pocos segundos.
- «Hen Ferchetan» (Tradicional galesa): [cNJvd6c6B4E](https://www.youtube.com/watch?v=cNJvd6c6B4E). La última estrofa se oye en un solo segmento del reconocedor galés (1:47) y el alineador la amontona en cuatro segundos.
- «In stiller Nacht» (Johannes Brahms): [hVtD63KLlsw 9:53:02](https://www.youtube.com/watch?v=hVtD63KLlsw&t=35582s). Dos coros la cantan en la comp. 79 y los dos tramos están ubicados, pero el alineador se ancla en palabras sueltas mal oídas (su normalización además pierde la ß) y amontona las líneas.
- «La pastorella si leva per tempo» (anónimo del siglo XV (canzone a ballo florentina; texto atribuido a veces a Angelo Poliziano)): [e3hQ1pdkgrE](https://www.youtube.com/watch?v=e3hQ1pdkgrE). Lo único que oyó el reconocedor en castellano es la última estrofa (1:38) y el alineador amontona ahí todo el texto; además, los coros cantan una edición con algunas palabras distintas y un verso más que la guardada.
- «La vieja» (Hermanos Díaz, arr. Vivian Tabush): [2HAIydtrM4k](https://www.youtube.com/watch?v=2HAIydtrM4k) [T3ZxMzX5pgQ](https://www.youtube.com/watch?v=T3ZxMzX5pgQ). En 2HAIydtrM4k el último tramo del canto no se oye y las cinco últimas líneas se amontonan en tres segundos; en T3ZxMzX5pgQ lo único oído son palabras sueltas de los subtítulos de YouTube, y el alineador se ancla en ellas.
- «Mi glywaf dyner lais (Arglwydd, dyma fi)» (Lewis Hartsough (I hear thy welcome voice); versión galesa de John Roberts, Ieuan Gwyllt (1822-1877); tôn Gwahoddiad): [x4u77VKMhak](https://www.youtube.com/watch?v=x4u77VKMhak). El estribillo final se canta dos veces y el reconocedor galés oye la última estrofa con los estribillos en un solo segmento, así que el alineador amontona las seis últimas líneas en tres segundos.
- «Nada» (tango, José Dames – Horacio Sanguinetti, arr. Eduardo Ferraudi): [gaMvo5_oXhg](https://www.youtube.com/watch?v=gaMvo5_oXhg) [sCboAvAxOKU](https://www.youtube.com/watch?v=sCboAvAxOKU). Clips de la competencia principal de coro mixto (Chubut 2013, comp. 68), con esta obra al comienzo: Whisper oyó solo algunas líneas sueltas, casi todas del estribillo, y el alineador amontona en ellas el resto del texto.
- «Rosa Amarela» (Tradicional brasileña; arreglo coral de Heitor Villa-Lobos): [BC61L8txOaQ 8:59:15](https://www.youtube.com/watch?v=BC61L8txOaQ&t=32355s). Chubut 2025, comp. 75 (hacia 8:59:15): lo único que oyó el reconocedor en castellano es la primera línea, y el alineador amontona ahí todo el texto.
- «Salve Regina» (Antífona mariana (atribuida a Hermann Contractus, s. XI); música de autor no identificado): [jNt92b9X0M0 0:12](https://www.youtube.com/watch?v=jNt92b9X0M0&t=12s). Whisper tomó el canto por galés y lo único que oyó el reconocedor en castellano es una línea a 2:12; el alineador amontona ahí todo el texto, que se canta entero desde 0:12.
- «Sul y Blodau» (Owen Williams; geiriau Eifion Wyn («Hwiangerdd Sul y Blodau»)): [qFZyl93FA9A](https://www.youtube.com/watch?v=qFZyl93FA9A). El reconocedor galés oye la última estrofa entera en un solo segmento (hacia 1:42) y el alineador la amontona en cuatro segundos.
- «Tshotsholoza» (canción tradicional sudafricana (nguni: zulú y ndebele), arr. Jeffery L. Ames): [RZ3aHrvj4Es](https://www.youtube.com/watch?v=RZ3aHrvj4Es). Whisper en castellano oyó una sola línea (1:07) y el alineador amontona en ella casi todo el texto; el arreglo agrega además sílabas sin texto, que no están guardadas.

### No se canta en ese video

- «Affanni del pensier» (arietta, George F. Händel): [eNmj-1_HlIk 24:13](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=1453s). El capítulo de la comp. 47 tiene solo el llamado y el aviso de que el único participante no estaba, y en el resto de la sesión no se canta.
- «Cantate Domino» (Hans Leo Hassler): [EUtZrvORMXw](https://www.youtube.com/watch?v=EUtZrvORMXw). Aunque el título del video nombra la comp. 65, ninguna de sus nueve actuaciones es esta obra.
- «Miedo» (Fernando Moruja): [ZfwMxCXBdpM 1:43:36](https://www.youtube.com/watch?v=ZfwMxCXBdpM&t=6216s). La transmisión pasa del anuncio de la comp. 65 (hacia 1:43:42) al veredicto del jurado, así que la actuación no está en la sesión; el clip SQHehsJfn1w la tiene y ya está alineado.
- «Oro y plata» (Homero Manzi / C. J. Pérez, arr. coral Javier Zentner): [SvBTOh3OlMg 4:25:47](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=15947s). La transmisión se corta dentro de la comp. 73 (Chubut 2019), cuando solo cantó el primer coro y con otra obra; hace falta otra grabación.
- «Ubi caritas» (Gjeilo): [8KefoF3wKo0](https://www.youtube.com/watch?v=8KefoF3wKo0). El clip tiene otra obra del mismo coro; su Ubi caritas está en LQ28BhyOZBQ y x0-pSbbCHIA, donde ya está alineado.

### Versión por confirmar

- «Bugeilio'r Gwenith Gwyn»: [wpSYMGm72Bk 16:57](https://www.youtube.com/watch?v=wpSYMGm72Bk&t=1017s). La letra tradicional es de dominio público, pero de este arreglo de Robat Arwyn (Chubut 2024, comp. 70, de 16:57 a 20:00) solo se reconoce una línea suelta: falta confirmar a oído qué estrofas canta y en qué orden, y la única fuente digital del texto no cita una edición impresa.
- «Laudamus»: [RVs3i42XPWY](https://www.youtube.com/watch?v=RVs3i42XPWY). La tonada se canta con un himno de Pantycelyn, de dominio público, que gobaith.cymru publica en varias versiones (https://gobaith.cymru/angelfire/G%28gwaed%20%282%29%29.html): lo que se oye coincide con su primera estrofa, y falta confirmar qué versión se canta en las demás antes de guardar el texto.

## Obras «a elección» (identificar primero cuál se cantó)

Escuchar el video o leer el anuncio; con el título, la letra se pide como cualquier otra. También están las competencias de repertorio libre, cuya línea del programa da un género o un tema y no una obra. Un clip con una sola actuación sale de la lista cuando se sabe qué obra es (un texto, una entrada de huecos, su título o una identificación en `data/letras/identificaciones.json`); en una sesión larga queda, con lo ya identificado (un texto alineado dentro del capítulo de esa competencia o cuyo `programa` la nombra, o una identificación con su tiempo dentro del capítulo).

| Edición | Comp. | Programa | Video |
|---|---|---|---|
| chubut 2008 | 48 | Unawd canu emyn: hunanddewisiad. | [vMX7CFrV00E](https://www.youtube.com/watch?v=vMX7CFrV00E) |
| chubut 2008 | 48 | Unawd canu emyn: hunanddewisiad. | [wQVeO6LDoLo](https://www.youtube.com/watch?v=wQVeO6LDoLo) |
| chubut 2008 | 49 | Unawd cerdd dant: hunanddewisiad gyda chyfeiliant telyn. | [s-n7yePbnyc](https://www.youtube.com/watch?v=s-n7yePbnyc) |
| chubut 2008 | 50 | Unawd canu gwerin: hunanddewisiad digyfeiliant. | [UMRSF_3_xRw](https://www.youtube.com/watch?v=UMRSF_3_xRw) |
| chubut 2008 | 50 | Unawd canu gwerin: hunanddewisiad digyfeiliant. | [V64yopgDBO0](https://www.youtube.com/watch?v=V64yopgDBO0) |
| chubut 2008 | 51 | Unawd cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd. | [4EiWgA5foHQ](https://www.youtube.com/watch?v=4EiWgA5foHQ) |
| chubut 2008 | 51 | Unawd cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd. | [7LXUOFJKEwE](https://www.youtube.com/watch?v=7LXUOFJKEwE) |
| chubut 2008 | 51 | Unawd cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd. | [f_2KdfpXyAQ](https://www.youtube.com/watch?v=f_2KdfpXyAQ) |
| chubut 2008 | 66 | Parti cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd. | [XfPi6hfAtvc](https://www.youtube.com/watch?v=XfPi6hfAtvc) |
| chubut 2008 | 66 | Parti cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd. | [d4MIBT73U3I](https://www.youtube.com/watch?v=d4MIBT73U3I) |
| chubut 2008 | 71 | Cân actol: hunanddewisiad. | [YlogRxR5Is0](https://www.youtube.com/watch?v=YlogRxR5Is0) |
| chubut 2008 | 75 | Conjunto o coro familiar: obra de libre elección. | [zUa_toUpa2c](https://www.youtube.com/watch?v=zUa_toUpa2c) |
| chubut 2008 | 87 | Coro de formación libre: arreglo de música popular argentina o latinoamericana. | [ln1HLi4jKHc](https://www.youtube.com/watch?v=ln1HLi4jKHc) |
| chubut 2008 | 87 | Coro de formación libre: arreglo de música popular argentina o latinoamericana. | [uIf594HbNHo](https://www.youtube.com/watch?v=uIf594HbNHo) |
| chubut 2009 | 49 | Unawd canu emyn: hunanddewisiad · a elección en galés. | [7WQpV8GguhM](https://www.youtube.com/watch?v=7WQpV8GguhM) |
| chubut 2009 | 49 | Unawd canu emyn: hunanddewisiad · a elección en galés. | [qSO6mBi4xrE](https://www.youtube.com/watch?v=qSO6mBi4xrE) |
| chubut 2009 | 52 | Unawd cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd · a elección con acompañamiento libre. | [ThC4oGGyWRI](https://www.youtube.com/watch?v=ThC4oGGyWRI) |
| chubut 2009 | 52 | Unawd cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd · a elección con acompañamiento libre. | [aKjO1DL4B7g](https://www.youtube.com/watch?v=aKjO1DL4B7g) |
| chubut 2009 | 52 | Unawd cân ysgafn: hunanddewisiad gyda chyfeiliant rhydd · a elección con acompañamiento libre. | [dMGVBgr5yC4](https://www.youtube.com/watch?v=dMGVBgr5yC4) |
| chubut 2009 | 60 | Dúo masculino, femenino o mixto: libre a elección. | [cssmafC6tug](https://www.youtube.com/watch?v=cssmafC6tug) |
| chubut 2009 | 60 | Dúo masculino, femenino o mixto: libre a elección. | [oTxml_McS1M](https://www.youtube.com/watch?v=oTxml_McS1M) |
| chubut 2009 | 76 | Conjunto vocal de formación libre hasta 12 integrantes: arreglo de música popular argentina a capella a ele… | [KTzdEJEaAi8](https://www.youtube.com/watch?v=KTzdEJEaAi8) |
| chubut 2009 | 76 | Conjunto vocal de formación libre hasta 12 integrantes: arreglo de música popular argentina a capella a ele… | [XBSVKBgIy0I](https://www.youtube.com/watch?v=XBSVKBgIy0I) |
| chubut 2012 | 45 | Solo libre: tema del folklore argentino a elección. | [Tv0a4Soo8C4](https://www.youtube.com/watch?v=Tv0a4Soo8C4) |
| chubut 2012 | 45 | Solo libre: tema del folklore argentino a elección. | [hiNBxSi60xs](https://www.youtube.com/watch?v=hiNBxSi60xs) |
| chubut 2012 | 45 | Solo libre: tema del folklore argentino a elección. | [k4-T7dR4aC8](https://www.youtube.com/watch?v=k4-T7dR4aC8) |
| chubut 2012 | 45 | Solo libre: tema del folklore argentino a elección. | [x1BQXgFFx-o](https://www.youtube.com/watch?v=x1BQXgFFx-o) |
| chubut 2012 | 46 | Solo libre: música ciudadana (tango, milonga) a elección. | [DvLQqrlwS9M](https://www.youtube.com/watch?v=DvLQqrlwS9M) |
| chubut 2012 | 47 | Deuawd agored, merched / dynion / cymysg: hunanddewisiad. | [3nuPlHowA1M](https://www.youtube.com/watch?v=3nuPlHowA1M) |
| chubut 2012 | 47 | Deuawd agored, merched / dynion / cymysg: hunanddewisiad. | [DBUfkcAT9Ts](https://www.youtube.com/watch?v=DBUfkcAT9Ts) |
| chubut 2012 | 53 | Parti neu gôr teulu: hunanddewisiad. | [odZNx0lU334](https://www.youtube.com/watch?v=odZNx0lU334) |
| chubut 2012 | 56 | Parti neu gôr cân actol: hunanddewisiad. | [2BVQ4FCDE7o](https://www.youtube.com/watch?v=2BVQ4FCDE7o) |
| chubut 2012 | 56 | Parti neu gôr cân actol: hunanddewisiad. | [R3WrBWEWb8s](https://www.youtube.com/watch?v=R3WrBWEWb8s) |
| chubut 2012 | 56 | Parti neu gôr cân actol: hunanddewisiad. | [Yenph7fcJWA](https://www.youtube.com/watch?v=Yenph7fcJWA) |
| chubut 2012 | 60 | Conjunto familiar: obra o arreglo coral a elección. | [pUSYZZMAmMo](https://www.youtube.com/watch?v=pUSYZZMAmMo) |
| chubut 2012 | 62 | Prif gystadleuaeth (mwy nag 20 aelod · más de 20 integrantes). Anthem: «Eiddot Ti, O Dduw, yw y Mawredd» (Y… | [6bEQQTDyMqY](https://www.youtube.com/watch?v=6bEQQTDyMqY) |
| chubut 2012 | 62 | Prif gystadleuaeth (mwy nag 20 aelod · más de 20 integrantes). Anthem: «Eiddot Ti, O Dduw, yw y Mawredd» (Y… | [ATN6kZ86h8s](https://www.youtube.com/watch?v=ATN6kZ86h8s) |
| chubut 2012 | 63 | Ail gystadleuaeth (mwy nag 20 aelod · más de 20 integrantes): «Dal hi'n Dynn», R. Arwyn; darn gwrthgyferbyn… | [VIXOzSYSmlA](https://www.youtube.com/watch?v=VIXOzSYSmlA) |
| chubut 2012 | 69 | Coro de formación libre: obra contemporánea a elección. | [3s64YIPoh1g](https://www.youtube.com/watch?v=3s64YIPoh1g) |
| chubut 2012 | 69 | Coro de formación libre: obra contemporánea a elección. | [9lwmuMcYE58](https://www.youtube.com/watch?v=9lwmuMcYE58) |
| chubut 2013 | 41 | Unawd emyn: hunanddewisiad. | [idGP4mh7WNA](https://www.youtube.com/watch?v=idGP4mh7WNA) |
| chubut 2013 | 43 | Unawd cân ysgafn: hunanddewisiad. | [4g2ytOt39wE](https://www.youtube.com/watch?v=4g2ytOt39wE) |
| chubut 2013 | 43 | Unawd cân ysgafn: hunanddewisiad. | [MKiNT2QZLIQ](https://www.youtube.com/watch?v=MKiNT2QZLIQ) |
| chubut 2013 | 43 | Unawd cân ysgafn: hunanddewisiad. | [W8xssBPNhlU](https://www.youtube.com/watch?v=W8xssBPNhlU) |
| chubut 2013 | 43 | Unawd cân ysgafn: hunanddewisiad. | [eTllzKV3a78](https://www.youtube.com/watch?v=eTllzKV3a78) |
| chubut 2013 | 44 | Solo libre: aria u obra de autor académico a libre elección. | [0cxcTjG2kGk](https://www.youtube.com/watch?v=0cxcTjG2kGk) |
| chubut 2013 | 44 | Solo libre: aria u obra de autor académico a libre elección. | [WoihPcx-4Yo](https://www.youtube.com/watch?v=WoihPcx-4Yo) |
| chubut 2013 | 44 | Solo libre: aria u obra de autor académico a libre elección. | [yeanXbjOf6A](https://www.youtube.com/watch?v=yeanXbjOf6A) |
| chubut 2013 | 45 | Solo libre: tema del folklore argentino a libre elección. | [TlYWxYvqqTo](https://www.youtube.com/watch?v=TlYWxYvqqTo) |
| chubut 2013 | 45 | Solo libre: tema del folklore argentino a libre elección. | [Zp7PNRAazAQ](https://www.youtube.com/watch?v=Zp7PNRAazAQ) |
| chubut 2013 | 46 | Solo libre: música ciudadana (tango, milonga) a libre elección. | [CWVnRo5mqq4](https://www.youtube.com/watch?v=CWVnRo5mqq4) |
| chubut 2013 | 47 | Solo libre: música pop o rock a libre elección. | [8vDL2an8rbY](https://www.youtube.com/watch?v=8vDL2an8rbY) |
| chubut 2013 | 47 | Solo libre: música pop o rock a libre elección. | [bV0w3s-1CE4](https://www.youtube.com/watch?v=bV0w3s-1CE4) |
| chubut 2013 | 47 | Solo libre: música pop o rock a libre elección. | [ri03_eLKUCY](https://www.youtube.com/watch?v=ri03_eLKUCY) |
| chubut 2013 | 48 | Solo libre: tema a elección, con puesta en escena. | [0FI-LViwRwQ](https://www.youtube.com/watch?v=0FI-LViwRwQ) |
| chubut 2013 | 48 | Solo libre: tema a elección, con puesta en escena. | [JQou5bh5HQY](https://www.youtube.com/watch?v=JQou5bh5HQY) |
| chubut 2013 | 48 | Solo libre: tema a elección, con puesta en escena. | [v1-O6wB14Tk](https://www.youtube.com/watch?v=v1-O6wB14Tk) |
| chubut 2013 | 51 | Dúo libre: tema a elección. | [ONxTmu5ZBMc](https://www.youtube.com/watch?v=ONxTmu5ZBMc) |
| chubut 2013 | 51 | Dúo libre: tema a elección. | [otnRyCC8s10](https://www.youtube.com/watch?v=otnRyCC8s10) |
| chubut 2013 | 56 | Parti neu gôr teulu: hunanddewisiad. | [U1MjDx-A0Ls](https://www.youtube.com/watch?v=U1MjDx-A0Ls) |
| chubut 2013 | 61 | Conjunto vocal con ensamble instrumental hasta 16 integrantes: obra del Renacimiento a libre elección. | [QrhjE-FoPeo](https://www.youtube.com/watch?v=QrhjE-FoPeo) |
| chubut 2013 | 64 | Conjunto familiar: obra o arreglo coral a libre elección con o sin acompañamiento instrumental. | [I-fOH2ngyw4](https://www.youtube.com/watch?v=I-fOH2ngyw4) |
| chubut 2013 | 65 | Prif gystadleuaeth: a) «Iesu, Drud Ddifyrrwch Dynion», J. Bach (Y Llawlyfr Moliant Newydd); b) hunanddewisi… | [RLf-rMsfxVw](https://www.youtube.com/watch?v=RLf-rMsfxVw) |
| chubut 2013 | 65 | Prif gystadleuaeth: a) «Iesu, Drud Ddifyrrwch Dynion», J. Bach (Y Llawlyfr Moliant Newydd); b) hunanddewisi… | [Xc08DZcPQvE](https://www.youtube.com/watch?v=Xc08DZcPQvE) |
| chubut 2013 | 66 | Ail gystadleuaeth: a) «Suo Gân», G. Glyn (Cadwyn); b) hunanddewisiad, darn gwrthgyferbyniol. | [RJCMbTchtgw](https://www.youtube.com/watch?v=RJCMbTchtgw) |
| chubut 2013 | 66 | Ail gystadleuaeth: a) «Suo Gân», G. Glyn (Cadwyn); b) hunanddewisiad, darn gwrthgyferbyniol. | [lVJXiosXPo4](https://www.youtube.com/watch?v=lVJXiosXPo4) |
| chubut 2013 | 66 | Ail gystadleuaeth: a) «Suo Gân», G. Glyn (Cadwyn); b) hunanddewisiad, darn gwrthgyferbyniol. | [ps3CFGC3AfE](https://www.youtube.com/watch?v=ps3CFGC3AfE) |
| chubut 2013 | 68 | Competencia principal coro mixto: a) «Nada», tango, José Dames – Horacio Sanguinetti, arr. Eduardo Ferraudi… | [-272dzknxa8](https://www.youtube.com/watch?v=-272dzknxa8) |
| chubut 2013 | 68 | Competencia principal coro mixto: a) «Nada», tango, José Dames – Horacio Sanguinetti, arr. Eduardo Ferraudi… | [gaMvo5_oXhg](https://www.youtube.com/watch?v=gaMvo5_oXhg) |
| chubut 2013 | 68 | Competencia principal coro mixto: a) «Nada», tango, José Dames – Horacio Sanguinetti, arr. Eduardo Ferraudi… | [sCboAvAxOKU](https://www.youtube.com/watch?v=sCboAvAxOKU) |
| chubut 2013 | 69 | Segunda competencia principal coro mixto: a) «Ave María», Villa Lobos; b) obra original universal a elecció… | [W8VmPf8ZAZs](https://www.youtube.com/watch?v=W8VmPf8ZAZs) |
| chubut 2014 | 41 | Unawd cân werin: hunanddewisiad. | [LQYOcu3ZHY4](https://www.youtube.com/watch?v=LQYOcu3ZHY4) |
| chubut 2014 | 42 | Unawd cân ysgafn: hunanddewisiad. | [glphoRejriI](https://www.youtube.com/watch?v=glphoRejriI) |
| chubut 2014 | 42 | Unawd cân ysgafn: hunanddewisiad. | [kdHv7ZZtGWA](https://www.youtube.com/watch?v=kdHv7ZZtGWA) |
| chubut 2014 | 42 | Unawd cân ysgafn: hunanddewisiad. | [wGrQJsJ04Os](https://www.youtube.com/watch?v=wGrQJsJ04Os) |
| chubut 2014 | 44 | Unawd canu emyn: hunanddewisiad. | [4oPUMnC2HmY](https://www.youtube.com/watch?v=4oPUMnC2HmY) |
| chubut 2014 | 45 | Unawd cerdd dant: hunanddewisiad. | [57fukjKdjHo](https://www.youtube.com/watch?v=57fukjKdjHo) |
| chubut 2014 | 45 | Unawd cerdd dant: hunanddewisiad. | [nSIxi82Ijn0](https://www.youtube.com/watch?v=nSIxi82Ijn0) |
| chubut 2014 | 47 | Solo libre: música folklórica argentina a elección. | [PJlXTNMrfTU](https://www.youtube.com/watch?v=PJlXTNMrfTU) |
| chubut 2014 | 47 | Solo libre: música folklórica argentina a elección. | [pH2klRbo24o](https://www.youtube.com/watch?v=pH2klRbo24o) |
| chubut 2014 | 48 | Solo libre: música ciudadana (tango, milonga) a elección. | [OAJc5yzQnec](https://www.youtube.com/watch?v=OAJc5yzQnec) |
| chubut 2014 | 49 | Solo libre: música rock o blues, homenaje a Luis Spinetta y Pappo Napolitano. | [pbIhUN4qq-g](https://www.youtube.com/watch?v=pbIhUN4qq-g) |
| chubut 2014 | 49 | Solo libre: música rock o blues, homenaje a Luis Spinetta y Pappo Napolitano. | [xkIeW4aUeTs](https://www.youtube.com/watch?v=xkIeW4aUeTs) |
| chubut 2014 | 53 | Dúo de voces iguales o mixtas: obra a elección. | [JIsGRpthcF0](https://www.youtube.com/watch?v=JIsGRpthcF0) |
| chubut 2014 | 53 | Dúo de voces iguales o mixtas: obra a elección. | [xOjAPMdDG9Q](https://www.youtube.com/watch?v=xOjAPMdDG9Q) |
| chubut 2014 | 58 | Parti neu gôr teulu: hunanddewisiad. | [n8z0lfQBaOw](https://www.youtube.com/watch?v=n8z0lfQBaOw) |
| chubut 2014 | 59 | Parti neu gôr capel: hunanddewisiad. | [A6uo4JmDNnk](https://www.youtube.com/watch?v=A6uo4JmDNnk) |
| chubut 2014 | 59 | Parti neu gôr capel: hunanddewisiad. | [_jEGb96U5uM](https://www.youtube.com/watch?v=_jEGb96U5uM) |
| chubut 2014 | 61 | Cân actol: «Gŵyl y Glaniad». | [SmisBekNJBQ](https://www.youtube.com/watch?v=SmisBekNJBQ) |
| chubut 2014 | 66 | Conjunto familiar: obra o arreglo coral con o sin acompañamiento instrumental. | [5fqnby15GUc](https://www.youtube.com/watch?v=5fqnby15GUc) |
| chubut 2014 | 66 | Conjunto familiar: obra o arreglo coral con o sin acompañamiento instrumental. | [Fh-7ET4ngUE](https://www.youtube.com/watch?v=Fh-7ET4ngUE) |
| chubut 2014 | 67 | Conjunto de capilla: obra o arreglo coral con o sin acompañamiento instrumental. | [dWkqgSLfZJA](https://www.youtube.com/watch?v=dWkqgSLfZJA) |
| chubut 2014 | 68 | Côr cymysg: hunanddewisiad. | [LdJHhBdJmNs](https://www.youtube.com/watch?v=LdJHhBdJmNs) |
| chubut 2014 | 68 | Côr cymysg: hunanddewisiad. | [lALxqJtGeyo](https://www.youtube.com/watch?v=lALxqJtGeyo) |
| chubut 2014 | 68 | Côr cymysg: hunanddewisiad. | [wPTioMvL5IU](https://www.youtube.com/watch?v=wPTioMvL5IU) |
| chubut 2014 | 69 | Prif gystadleuaeth (côr dros 30 o leisiau): «Teyrnasa, Iesu Mawr», trefn. Jenkin Morgan; darn gwrthgyferbyn… | [fTEn7dSJJxQ](https://www.youtube.com/watch?v=fTEn7dSJJxQ) |
| chubut 2014 | 70 | Ail gystadleuaeth (côr dros 30 o leisiau): «Anfonaf Angel», Hywel Gwynfryn – Robat Arwyn; darn gwrthgyferby… | [3U_Q9iXVmLw](https://www.youtube.com/watch?v=3U_Q9iXVmLw) |
| chubut 2014 | 70 | Ail gystadleuaeth (côr dros 30 o leisiau): «Anfonaf Angel», Hywel Gwynfryn – Robat Arwyn; darn gwrthgyferby… | [cbs713oeNx4](https://www.youtube.com/watch?v=cbs713oeNx4) |
| chubut 2014 | 70 | Ail gystadleuaeth (côr dros 30 o leisiau): «Anfonaf Angel», Hywel Gwynfryn – Robat Arwyn; darn gwrthgyferby… | [sM3Yq450GMY](https://www.youtube.com/watch?v=sM3Yq450GMY) |
| chubut 2015 | 57 | Unawd cân ysgafn: hunanddewisiad. | [8fkm93hGEt4](https://www.youtube.com/watch?v=8fkm93hGEt4) |
| chubut 2015 | 57 | Unawd cân ysgafn: hunanddewisiad. | [wOjp8o7mwSg](https://www.youtube.com/watch?v=wOjp8o7mwSg) |
| chubut 2015 | 58 | Unawd canu emyn: hunanddewisiad. | [CA6vNs5NHI4](https://www.youtube.com/watch?v=CA6vNs5NHI4) |
| chubut 2015 | 58 | Unawd canu emyn: hunanddewisiad. | [JkWa0Q3DDPg](https://www.youtube.com/watch?v=JkWa0Q3DDPg) |
| chubut 2015 | 60 | Solo libre: aria u obra original académica del repertorio universal a elección. | [CiznsDgLsMg](https://www.youtube.com/watch?v=CiznsDgLsMg) |
| chubut 2015 | 60 | Solo libre: aria u obra original académica del repertorio universal a elección. | [XX9OVATOEIE](https://www.youtube.com/watch?v=XX9OVATOEIE) |
| chubut 2015 | 62 | Solo libre: música ciudadana (tango, milonga, vals) a elección. | [Df_T7paaPqY](https://www.youtube.com/watch?v=Df_T7paaPqY) |
| chubut 2015 | 62 | Solo libre: música ciudadana (tango, milonga, vals) a elección. | [luqavlHcogY](https://www.youtube.com/watch?v=luqavlHcogY) |
| chubut 2015 | 62 | Solo libre: música ciudadana (tango, milonga, vals) a elección. | [pcMbWyL3pxI](https://www.youtube.com/watch?v=pcMbWyL3pxI) |
| chubut 2015 | 67 | Dúo de voces iguales o mixtas: obra del repertorio popular a elección. | [G10YK74oRH0](https://www.youtube.com/watch?v=G10YK74oRH0) |
| chubut 2015 | 67 | Dúo de voces iguales o mixtas: obra del repertorio popular a elección. | [PeFm9zpC86s](https://www.youtube.com/watch?v=PeFm9zpC86s) |
| chubut 2015 | 67 | Dúo de voces iguales o mixtas: obra del repertorio popular a elección. | [SDx1U5GWfv4](https://www.youtube.com/watch?v=SDx1U5GWfv4) |
| chubut 2015 | 69 | Cuarteto: himno en castellano a elección. | [-nEHxXyvA64](https://www.youtube.com/watch?v=-nEHxXyvA64) |
| chubut 2015 | 69 | Cuarteto: himno en castellano a elección. | [nDygakPG2RY](https://www.youtube.com/watch?v=nDygakPG2RY) |
| chubut 2015 | 69 | Cuarteto: himno en castellano a elección. | [ofFw1CHb8NY](https://www.youtube.com/watch?v=ofFw1CHb8NY) |
| chubut 2015 | 69 | Cuarteto: himno en castellano a elección. | [tS8rfCKgSOg](https://www.youtube.com/watch?v=tS8rfCKgSOg) |
| chubut 2015 | 75 | Parti neu gôr teulu: hunanddewisiad. | [UVhVWxy_P0w](https://www.youtube.com/watch?v=UVhVWxy_P0w) |
| chubut 2015 | 75 | Parti neu gôr teulu: hunanddewisiad. | [_YV63qRxS1Y](https://www.youtube.com/watch?v=_YV63qRxS1Y) |
| chubut 2015 | 75 | Parti neu gôr teulu: hunanddewisiad. | [tsGUiPhbNa4](https://www.youtube.com/watch?v=tsGUiPhbNa4) |
| chubut 2015 | 76 | Parti neu gôr capel: hunanddewisiad. | [pWEYQyNM4vA](https://www.youtube.com/watch?v=pWEYQyNM4vA) |
| chubut 2015 | 78 | Cân actol: «Ar ôl cant a hanner o flynyddoedd…». | [9Z1OmJcblsM](https://www.youtube.com/watch?v=9Z1OmJcblsM) |
| chubut 2015 | 80 | Conjunto vocal libre con ensamble instrumental: obra del repertorio universal a elección. | [a78WEYuxcFA](https://www.youtube.com/watch?v=a78WEYuxcFA) |
| chubut 2015 | 80 | Conjunto vocal libre con ensamble instrumental: obra del repertorio universal a elección. | [fKNFKU8I10E](https://www.youtube.com/watch?v=fKNFKU8I10E) |
| chubut 2015 | 83 | Conjunto familiar: obra o arreglo coral a elección. | [Nae-FW2eadQ](https://www.youtube.com/watch?v=Nae-FW2eadQ) |
| chubut 2015 | 83 | Conjunto familiar: obra o arreglo coral a elección. | [buYs2gaivLs](https://www.youtube.com/watch?v=buYs2gaivLs) |
| chubut 2015 | 83 | Conjunto familiar: obra o arreglo coral a elección. | [wq812YIKuO8](https://www.youtube.com/watch?v=wq812YIKuO8) |
| chubut 2015 | 84 | Conjunto de capilla: obra o arreglo coral a elección. | [VsPq3ez_O9Q](https://www.youtube.com/watch?v=VsPq3ez_O9Q) |
| chubut 2015 | 84 | Conjunto de capilla: obra o arreglo coral a elección. | [p0TkNGBm1GY](https://www.youtube.com/watch?v=p0TkNGBm1GY) |
| chubut 2015 | 86 | Côr o unrhyw gyfuniad: hunanddewisiad. | [jG4Yxk5P11I](https://www.youtube.com/watch?v=jG4Yxk5P11I) |
| chubut 2015 | 86 | Côr o unrhyw gyfuniad: hunanddewisiad. | [wUW2cA4H4sk](https://www.youtube.com/watch?v=wUW2cA4H4sk) |
| chubut 2015 | 87 | Ail gystadleuaeth (dim mwy na 30 o leisiau): «Dyddiau Dyn sydd Fel Glaswelltyn», Thomas Davies; darn gwrthg… | [seH9fQCJ2jk](https://www.youtube.com/watch?v=seH9fQCJ2jk) |
| chubut 2015 | 89 | Competencia principal. Coro mixto: «Salamanqueando pa' mí», Raúl Carnota, v. c. Hugo de la Vega; obra contr… | [F54HTSkjvLw](https://www.youtube.com/watch?v=F54HTSkjvLw) |
| chubut 2015 | 89 | Competencia principal. Coro mixto: «Salamanqueando pa' mí», Raúl Carnota, v. c. Hugo de la Vega; obra contr… | [V_AiZP9gVFE](https://www.youtube.com/watch?v=V_AiZP9gVFE) |
| chubut 2015 | 89 | Competencia principal. Coro mixto: «Salamanqueando pa' mí», Raúl Carnota, v. c. Hugo de la Vega; obra contr… | [wldmZUPS5fY](https://www.youtube.com/watch?v=wldmZUPS5fY) |
| chubut 2015 | 93 | Competencia especial del Sesquicentenario: relato sonoro de temática regional con dos canciones y un poema. | [1AQgOUeha9Y](https://www.youtube.com/watch?v=1AQgOUeha9Y) |
| chubut 2015 | 93 | Competencia especial del Sesquicentenario: relato sonoro de temática regional con dos canciones y un poema. | [sWcR6Qrz7hs](https://www.youtube.com/watch?v=sWcR6Qrz7hs) |
| chubut 2015 | 93 | Competencia especial del Sesquicentenario: relato sonoro de temática regional con dos canciones y un poema. | [zrQVV8VlOOo](https://www.youtube.com/watch?v=zrQVV8VlOOo) |
| chubut 2018 | 44 | Unawd werin: hunanddewisiad. | [6E2zHPKN6Nw](https://www.youtube.com/watch?v=6E2zHPKN6Nw) |
| chubut 2018 | 44 | Unawd werin: hunanddewisiad. | [XLUelYclFcA](https://www.youtube.com/watch?v=XLUelYclFcA) |
| chubut 2018 | 46 | Unawd cân ysgafn: hunanddewisiad. | [BDEu5aVC2Xs](https://www.youtube.com/watch?v=BDEu5aVC2Xs) |
| chubut 2018 | 46 | Unawd cân ysgafn: hunanddewisiad. | [MhxPSOaMzbE](https://www.youtube.com/watch?v=MhxPSOaMzbE) |
| chubut 2018 | 46 | Unawd cân ysgafn: hunanddewisiad. | [dm0VVrMjoBE](https://www.youtube.com/watch?v=dm0VVrMjoBE) |
| chubut 2018 | 48 | Solo libre: música folklórica argentina o latinoamericana a elección. | [28MiN-ex0_8](https://www.youtube.com/watch?v=28MiN-ex0_8) |
| chubut 2018 | 48 | Solo libre: música folklórica argentina o latinoamericana a elección. | [DxhFRkNFgeQ](https://www.youtube.com/watch?v=DxhFRkNFgeQ) |
| chubut 2018 | 48 | Solo libre: música folklórica argentina o latinoamericana a elección. | [TXWiXUNUJ6c](https://www.youtube.com/watch?v=TXWiXUNUJ6c) |
| chubut 2018 | 48 | Solo libre: música folklórica argentina o latinoamericana a elección. | [utHSvsjwvwo 7:12:42](https://www.youtube.com/watch?v=utHSvsjwvwo&t=25962s) |
| chubut 2018 | 49 | Solo libre: música ciudadana (tango, milonga, vals) a elección. | [utHSvsjwvwo 5:48:52](https://www.youtube.com/watch?v=utHSvsjwvwo&t=20932s) (ya identificada aquí: «Naranjo en Flor») |
| chubut 2018 | 50 | Solo libre: canción rock o pop a elección. | [U95-bmeYBLg](https://www.youtube.com/watch?v=U95-bmeYBLg) |
| chubut 2018 | 50 | Solo libre: canción rock o pop a elección. | [eNmj-1_HlIk 2:24:27](https://www.youtube.com/watch?v=eNmj-1_HlIk&t=8667s) |
| chubut 2018 | 53 | Dúo de voces iguales o mixtas: obra del repertorio popular a elección. | [3QXswVOBBaI](https://www.youtube.com/watch?v=3QXswVOBBaI) |
| chubut 2018 | 53 | Dúo de voces iguales o mixtas: obra del repertorio popular a elección. | [G7V26561SMw](https://www.youtube.com/watch?v=G7V26561SMw) |
| chubut 2018 | 53 | Dúo de voces iguales o mixtas: obra del repertorio popular a elección. | [wi99njiWB0E](https://www.youtube.com/watch?v=wi99njiWB0E) |
| chubut 2018 | 55 | Cuarteto mixto: himno a elección. | [utHSvsjwvwo 5:24:25](https://www.youtube.com/watch?v=utHSvsjwvwo&t=19465s) (ya identificada aquí: «De quien pagó mi redención») |
| chubut 2018 | 57 | Parti cerdd dant: hunanddewisiad. | [yZiO2KB0R14](https://www.youtube.com/watch?v=yZiO2KB0R14) |
| chubut 2018 | 60 | Parti neu gôr teulu: hunanddewisiad. | [U0Hwpgr_CO0](https://www.youtube.com/watch?v=U0Hwpgr_CO0) |
| chubut 2018 | 60 | Parti neu gôr teulu: hunanddewisiad. | [Z5j5e5abLT8](https://www.youtube.com/watch?v=Z5j5e5abLT8) |
| chubut 2018 | 61 | Parti neu gôr capel: emyn neu gân Gristnogol hunanddewisiad. | [MIHR9EZbU7E](https://www.youtube.com/watch?v=MIHR9EZbU7E) |
| chubut 2018 | 68 | Conjunto o coro familiar: obra o arreglo a elección. | [HRxmkqZriME](https://www.youtube.com/watch?v=HRxmkqZriME) |
| chubut 2018 | 68 | Conjunto o coro familiar: obra o arreglo a elección. | [phGM8Sk5Ujg](https://www.youtube.com/watch?v=phGM8Sk5Ujg) |
| chubut 2018 | 68 | Conjunto o coro familiar: obra o arreglo a elección. | [utHSvsjwvwo 10:48](https://www.youtube.com/watch?v=utHSvsjwvwo&t=648s) |
| chubut 2018 | 69 | Conjunto o coro de capilla: obra o arreglo coral a elección. | [kD95Pcq8CUA](https://www.youtube.com/watch?v=kD95Pcq8CUA) |
| chubut 2018 | 72 | Ail gystadleuaeth (côr dros 20 o leisiau): «O Dduw, Rhana'th Fendithion», J. Rutter; cân ysgafn hunanddewis… | [aixCKFp0JQI](https://www.youtube.com/watch?v=aixCKFp0JQI) |
| chubut 2018 | 72 | Ail gystadleuaeth (côr dros 20 o leisiau): «O Dduw, Rhana'th Fendithion», J. Rutter; cân ysgafn hunanddewis… | [utHSvsjwvwo 6:09:16](https://www.youtube.com/watch?v=utHSvsjwvwo&t=22156s) |
| chubut 2018 | 72 | Ail gystadleuaeth (côr dros 20 o leisiau): «O Dduw, Rhana'th Fendithion», J. Rutter; cân ysgafn hunanddewis… | [zAlvajq-8Oo](https://www.youtube.com/watch?v=zAlvajq-8Oo) |
| chubut 2018 | 73 | Competencia principal. Coro mixto: «La muerte del ángel», Astor Piazolla, arr. Néstor Zadoff; obra religios… | [uQLo3_bBjWA](https://www.youtube.com/watch?v=uQLo3_bBjWA) |
| chubut 2018 | 73 | Competencia principal. Coro mixto: «La muerte del ángel», Astor Piazolla, arr. Néstor Zadoff; obra religios… | [utHSvsjwvwo 7:16:25](https://www.youtube.com/watch?v=utHSvsjwvwo&t=26185s) |
| chubut 2018 | 73 | Competencia principal. Coro mixto: «La muerte del ángel», Astor Piazolla, arr. Néstor Zadoff; obra religios… | [yFAau_xtzJk](https://www.youtube.com/watch?v=yFAau_xtzJk) |
| chubut 2019 | 44 | Unawd gwerin: hunanddewisiad. | [1aLrPaup4kk](https://www.youtube.com/watch?v=1aLrPaup4kk) |
| chubut 2019 | 45 | Unawd canu emyn: hunanddewisiad. | [GuOhTnHu_5w](https://www.youtube.com/watch?v=GuOhTnHu_5w) |
| chubut 2019 | 45 | Unawd canu emyn: hunanddewisiad. | [rrF1Ez4U0io](https://www.youtube.com/watch?v=rrF1Ez4U0io) |
| chubut 2019 | 46 | Unawd cân ysgafn: hunanddewisiad. | [BORWY_aHs_8](https://www.youtube.com/watch?v=BORWY_aHs_8) |
| chubut 2019 | 46 | Unawd cân ysgafn: hunanddewisiad. | [yw_2YaCIhy0](https://www.youtube.com/watch?v=yw_2YaCIhy0) |
| chubut 2019 | 48 | Solo libre: música folklórica argentina, a elección. | [Ih1nYKfzvS0](https://www.youtube.com/watch?v=Ih1nYKfzvS0) |
| chubut 2019 | 48 | Solo libre: música folklórica argentina, a elección. | [NeHqg7ytkjE](https://www.youtube.com/watch?v=NeHqg7ytkjE) |
| chubut 2019 | 48 | Solo libre: música folklórica argentina, a elección. | [SvBTOh3OlMg 2:00:55](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=7255s) (ya identificada aquí: «Alfonsina y el mar») |
| chubut 2019 | 49 | Solo libre: música ciudadana (tango, milonga, vals), a elección. | [OMiiqx1fqb0](https://www.youtube.com/watch?v=OMiiqx1fqb0) |
| chubut 2019 | 49 | Solo libre: música ciudadana (tango, milonga, vals), a elección. | [SvBTOh3OlMg 2:17:00](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=8220s) |
| chubut 2019 | 50 | Solo libre: rock nacional, un tema de Luis Alberto Spinetta a elección. | [-cs_oJl4QA4](https://www.youtube.com/watch?v=-cs_oJl4QA4) |
| chubut 2019 | 50 | Solo libre: rock nacional, un tema de Luis Alberto Spinetta a elección. | [JhVyd7-3xIk](https://www.youtube.com/watch?v=JhVyd7-3xIk) |
| chubut 2019 | 50 | Solo libre: rock nacional, un tema de Luis Alberto Spinetta a elección. | [ZfwMxCXBdpM 3:19:39](https://www.youtube.com/watch?v=ZfwMxCXBdpM&t=11979s) |
| chubut 2019 | 50 | Solo libre: rock nacional, un tema de Luis Alberto Spinetta a elección. | [aOvh2XSwERU](https://www.youtube.com/watch?v=aOvh2XSwERU) |
| chubut 2019 | 53 | Dúo de voces iguales o mixtas: obra a elección del repertorio popular argentino o latinoamericano. | [ZfwMxCXBdpM 2:00:44](https://www.youtube.com/watch?v=ZfwMxCXBdpM&t=7244s) |
| chubut 2019 | 53 | Dúo de voces iguales o mixtas: obra a elección del repertorio popular argentino o latinoamericano. | [_Ilm9yIVpgw](https://www.youtube.com/watch?v=_Ilm9yIVpgw) |
| chubut 2019 | 53 | Dúo de voces iguales o mixtas: obra a elección del repertorio popular argentino o latinoamericano. | [xnscjSsuFDE](https://www.youtube.com/watch?v=xnscjSsuFDE) |
| chubut 2019 | 56 | Parti cerdd dant: hunanddewisiad. | [gXBc2Z4pNKA](https://www.youtube.com/watch?v=gXBc2Z4pNKA) |
| chubut 2019 | 60 | Parti neu gôr teulu: hunanddewisiad. | [SvBTOh3OlMg 17:26](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=1046s) |
| chubut 2019 | 60 | Parti neu gôr teulu: hunanddewisiad. | [XDySL41IRvI](https://www.youtube.com/watch?v=XDySL41IRvI) |
| chubut 2019 | 60 | Parti neu gôr teulu: hunanddewisiad. | [Z-aM8U8aWlw](https://www.youtube.com/watch?v=Z-aM8U8aWlw) |
| chubut 2019 | 61 | Parti neu gôr capel: emyn neu gân Gristnogol. | [C9-UcpVfg3Q](https://www.youtube.com/watch?v=C9-UcpVfg3Q) |
| chubut 2019 | 61 | Parti neu gôr capel: emyn neu gân Gristnogol. | [KAKrzcMCsto](https://www.youtube.com/watch?v=KAKrzcMCsto) |
| chubut 2019 | 61 | Parti neu gôr capel: emyn neu gân Gristnogol. | [T5lkG8hpWJU](https://www.youtube.com/watch?v=T5lkG8hpWJU) |
| chubut 2019 | 68 | Conjunto o coro familiar: obra o arreglo coral en castellano a elección. | [g4i99zBwQkY](https://www.youtube.com/watch?v=g4i99zBwQkY) |
| chubut 2019 | 69 | Conjunto o coro de capilla: obra, himno o arreglo coral en castellano. | [5jfBCZXOoQo](https://www.youtube.com/watch?v=5jfBCZXOoQo) |
| chubut 2019 | 69 | Conjunto o coro de capilla: obra, himno o arreglo coral en castellano. | [CNPPUP17n5U](https://www.youtube.com/watch?v=CNPPUP17n5U) |
| chubut 2019 | 69 | Conjunto o coro de capilla: obra, himno o arreglo coral en castellano. | [SvBTOh3OlMg 20:41](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=1241s) |
| chubut 2019 | 69 | Conjunto o coro de capilla: obra, himno o arreglo coral en castellano. | [kBnaHJk2W1g](https://www.youtube.com/watch?v=kBnaHJk2W1g) |
| chubut 2019 | 74 | Segunda competencia principal para coro mixto: a) «Ave María», Karl Jenkins; b) obra de jazz, góspel o negr… | [SvBTOh3OlMg 3:13:26](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=11606s) |
| chubut 2019 | 75 | Coro de formación libre: obra original del repertorio coral universal a capella. | [J58oHXgG8m8](https://www.youtube.com/watch?v=J58oHXgG8m8) |
| chubut 2019 | 75 | Coro de formación libre: obra original del repertorio coral universal a capella. | [ZfwMxCXBdpM 4:23:56](https://www.youtube.com/watch?v=ZfwMxCXBdpM&t=15836s) |
| chubut 2019 | 76 | Coro de formación libre: obra o arreglo coral con recursos de ambientación, coreografía o puesta escénica, … | [1MquEylgREQ](https://www.youtube.com/watch?v=1MquEylgREQ) |
| chubut 2019 | 76 | Coro de formación libre: obra o arreglo coral con recursos de ambientación, coreografía o puesta escénica, … | [ZfwMxCXBdpM 5:06:54](https://www.youtube.com/watch?v=ZfwMxCXBdpM&t=18414s) |
| chubut 2019 | 76 | Coro de formación libre: obra o arreglo coral con recursos de ambientación, coreografía o puesta escénica, … | [svjhTB65tC0](https://www.youtube.com/watch?v=svjhTB65tC0) |
| chubut 2019 | 76 | Coro de formación libre: obra o arreglo coral con recursos de ambientación, coreografía o puesta escénica, … | [wV3_CdbXS3U](https://www.youtube.com/watch?v=wV3_CdbXS3U) |
| chubut 2019 | 77 | Coro de formación libre y conjunto instrumental de formación libre: obra a elección. | [FnGCixNxd3c](https://www.youtube.com/watch?v=FnGCixNxd3c) |
| chubut 2019 | 77 | Coro de formación libre y conjunto instrumental de formación libre: obra a elección. | [SvBTOh3OlMg 3:57:07](https://www.youtube.com/watch?v=SvBTOh3OlMg&t=14227s) |
| chubut 2022 | 43 | Unawd cân werin: hunanddewisiad. | [9Lqdd3GSXsA](https://www.youtube.com/watch?v=9Lqdd3GSXsA) |
| chubut 2022 | 44 | Unawd cân ysgafn: hunanddewisiad. | [D4JQJikUeU4](https://www.youtube.com/watch?v=D4JQJikUeU4) |
| chubut 2022 | 44 | Unawd cân ysgafn: hunanddewisiad. | [E3CRnzMZcBU](https://www.youtube.com/watch?v=E3CRnzMZcBU) |
| chubut 2022 | 44 | Unawd cân ysgafn: hunanddewisiad. | [jhnHlXV0K3c](https://www.youtube.com/watch?v=jhnHlXV0K3c) |
| chubut 2022 | 45 | Unawd canu emyn: hunanddewisiad. | [Jk3ao591O1w](https://www.youtube.com/watch?v=Jk3ao591O1w) |
| chubut 2022 | 45 | Unawd canu emyn: hunanddewisiad. | [QHT2dhP9mDI](https://www.youtube.com/watch?v=QHT2dhP9mDI) (ya identificada aquí: «Cant a Hanner») |
| chubut 2022 | 45 | Unawd canu emyn: hunanddewisiad. | [biKtvTMA3_Q](https://www.youtube.com/watch?v=biKtvTMA3_Q) (ya identificada aquí: «Mawr oedd Crist yn nhragwyddoldeb») |
| chubut 2022 | 45 | Unawd canu emyn: hunanddewisiad. | [e8uobkudz80](https://www.youtube.com/watch?v=e8uobkudz80) |
| chubut 2022 | 47 | Solo libre para voz femenina o masculina: obra de repertorio académico a elección. | [Eidkd1bEWWg](https://www.youtube.com/watch?v=Eidkd1bEWWg) |
| chubut 2022 | 47 | Solo libre para voz femenina o masculina: obra de repertorio académico a elección. | [cHEzcpcoEts](https://www.youtube.com/watch?v=cHEzcpcoEts) |
| chubut 2022 | 48 | Solo libre: música folklórica argentina a elección. | [-t5r4pwKx50 4:52:36](https://www.youtube.com/watch?v=-t5r4pwKx50&t=17556s) |
| chubut 2022 | 48 | Solo libre: música folklórica argentina a elección. | [5W8lfQJNmcA](https://www.youtube.com/watch?v=5W8lfQJNmcA) (ya identificada aquí: «Mi luna cautiva») |
| chubut 2022 | 48 | Solo libre: música folklórica argentina a elección. | [QPxpqis8oH4](https://www.youtube.com/watch?v=QPxpqis8oH4) |
| chubut 2022 | 48 | Solo libre: música folklórica argentina a elección. | [x8RR_Qe4sSA](https://www.youtube.com/watch?v=x8RR_Qe4sSA) (ya identificada aquí: «Grito santiagueño») |
| chubut 2022 | 49 | Solo libre: música rioplatense (tango, milonga, candombe, vals) a elección. | [WH4OYDOxrUY](https://www.youtube.com/watch?v=WH4OYDOxrUY) |
| chubut 2022 | 49 | Solo libre: música rioplatense (tango, milonga, candombe, vals) a elección. | [jdGAR_E9Rmw](https://www.youtube.com/watch?v=jdGAR_E9Rmw) |
| chubut 2022 | 49 | Solo libre: música rioplatense (tango, milonga, candombe, vals) a elección. | [kalSDptAgzM](https://www.youtube.com/watch?v=kalSDptAgzM) |
| chubut 2022 | 50 | Solo libre: canción de autor argentino (rock nacional, melódico, romántico). | [0X83qrUotz0 3:42:44](https://www.youtube.com/watch?v=0X83qrUotz0&t=13364s) |
| chubut 2022 | 50 | Solo libre: canción de autor argentino (rock nacional, melódico, romántico). | [2WWNYj59YUU](https://www.youtube.com/watch?v=2WWNYj59YUU) |
| chubut 2022 | 50 | Solo libre: canción de autor argentino (rock nacional, melódico, romántico). | [JYod-0yEpOk](https://www.youtube.com/watch?v=JYod-0yEpOk) |
| chubut 2022 | 50 | Solo libre: canción de autor argentino (rock nacional, melódico, romántico). | [Rl3REW7w3i4](https://www.youtube.com/watch?v=Rl3REW7w3i4) |
| chubut 2022 | 50 | Solo libre: canción de autor argentino (rock nacional, melódico, romántico). | [qtVJUfs4yHU](https://www.youtube.com/watch?v=qtVJUfs4yHU) |
| chubut 2022 | 50 | Solo libre: canción de autor argentino (rock nacional, melódico, romántico). | [uuaVJ3pXH5k](https://www.youtube.com/watch?v=uuaVJ3pXH5k) |
| chubut 2022 | 57 | Parti neu gôr teulu: hunanddewisiad. | [MdWrKWTvNGo](https://www.youtube.com/watch?v=MdWrKWTvNGo) |
| chubut 2022 | 57 | Parti neu gôr teulu: hunanddewisiad. | [NwvvMnESAi0](https://www.youtube.com/watch?v=NwvvMnESAi0) |
| chubut 2022 | 57 | Parti neu gôr teulu: hunanddewisiad. | [fKKhldgAkdo](https://www.youtube.com/watch?v=fKKhldgAkdo) |
| chubut 2022 | 58 | Parti neu gôr capel: hunanddewisiad. | [J3-drpsAHnU](https://www.youtube.com/watch?v=J3-drpsAHnU) |
| chubut 2022 | 58 | Parti neu gôr capel: hunanddewisiad. | [_rUaYAqshno](https://www.youtube.com/watch?v=_rUaYAqshno) |
| chubut 2022 | 64 | Conjunto o coro familiar: obra o arreglo coral a capella o con acompañamiento instrumental. | [-t5r4pwKx50 4:35:48](https://www.youtube.com/watch?v=-t5r4pwKx50&t=16548s) |
| chubut 2022 | 64 | Conjunto o coro familiar: obra o arreglo coral a capella o con acompañamiento instrumental. | [G2nNQYKhFMw](https://www.youtube.com/watch?v=G2nNQYKhFMw) |
| chubut 2022 | 64 | Conjunto o coro familiar: obra o arreglo coral a capella o con acompañamiento instrumental. | [QpDXRJIe5SQ](https://www.youtube.com/watch?v=QpDXRJIe5SQ) |
| chubut 2022 | 65 | Conjunto o coro de capilla: obra o arreglo en castellano. | [-t5r4pwKx50 1:30:05](https://www.youtube.com/watch?v=-t5r4pwKx50&t=5405s) |
| chubut 2022 | 65 | Conjunto o coro de capilla: obra o arreglo en castellano. | [CUo0vlmewmE](https://www.youtube.com/watch?v=CUo0vlmewmE) |
| chubut 2022 | 65 | Conjunto o coro de capilla: obra o arreglo en castellano. | [iKES0lB5n1A](https://www.youtube.com/watch?v=iKES0lB5n1A) |
| chubut 2022 | 69 | Cân actol, thema: «Cariad». | [hnbeKzmflXo](https://www.youtube.com/watch?v=hnbeKzmflXo) |
| chubut 2022 | 70 | Competencia principal coro mixto: a) «Ave Maria», Marcelo Valva; b) obra original sacra a elección. | [-t5r4pwKx50 8:24:13](https://www.youtube.com/watch?v=-t5r4pwKx50&t=30253s) |
| chubut 2022 | 70 | Competencia principal coro mixto: a) «Ave Maria», Marcelo Valva; b) obra original sacra a elección. | [9HciLCqfIas](https://www.youtube.com/watch?v=9HciLCqfIas) |
| chubut 2022 | 70 | Competencia principal coro mixto: a) «Ave Maria», Marcelo Valva; b) obra original sacra a elección. | [dT8A2GQSDlc](https://www.youtube.com/watch?v=dT8A2GQSDlc) |
| chubut 2022 | 73 | Coro de formación libre: obra con recursos de ambientación, movimiento o puesta escénica, a elección. | [0X83qrUotz0 4:55:27](https://www.youtube.com/watch?v=0X83qrUotz0&t=17727s) |
| chubut 2022 | 73 | Coro de formación libre: obra con recursos de ambientación, movimiento o puesta escénica, a elección. | [EtAthkvbRHY](https://www.youtube.com/watch?v=EtAthkvbRHY) |
| chubut 2023 | 44 | Unawd cerdd dant: hunanddewisiad. | [fBuwFDzNr4E](https://www.youtube.com/watch?v=fBuwFDzNr4E) |
| chubut 2023 | 46 | Unawd emyn: hunanddewisiad. | [AnLRusbVjGs](https://www.youtube.com/watch?v=AnLRusbVjGs) |
| chubut 2023 | 46 | Unawd emyn: hunanddewisiad. | [D-PpHKWfiyg](https://www.youtube.com/watch?v=D-PpHKWfiyg) |
| chubut 2023 | 46 | Unawd emyn: hunanddewisiad. | [EUtZrvORMXw](https://www.youtube.com/watch?v=EUtZrvORMXw) |
| chubut 2023 | 46 | Unawd emyn: hunanddewisiad. | [LXqDlh3REiY](https://www.youtube.com/watch?v=LXqDlh3REiY) |
| chubut 2023 | 46 | Unawd emyn: hunanddewisiad. | [eiwyiuYt_U0](https://www.youtube.com/watch?v=eiwyiuYt_U0) |
| chubut 2023 | 47 | Unawd werin: «Y March Glas», «Ym Mhontypridd» neu «Si Hei Lwli Mabi». | [AnLRusbVjGs](https://www.youtube.com/watch?v=AnLRusbVjGs) |
| chubut 2023 | 49 | Solo, música argentina: homenaje a María Elena Walsh, composición a elección. | [EV2CceTr4sk](https://www.youtube.com/watch?v=EV2CceTr4sk) |
| chubut 2023 | 49 | Solo, música argentina: homenaje a María Elena Walsh, composición a elección. | [fBuwFDzNr4E](https://www.youtube.com/watch?v=fBuwFDzNr4E) |
| chubut 2023 | 50 | Solo libre, música ciudadana: tango, milonga, vals o candombe. | [Bzz-Kt3iR8Q](https://www.youtube.com/watch?v=Bzz-Kt3iR8Q) |
| chubut 2023 | 50 | Solo libre, música ciudadana: tango, milonga, vals o candombe. | [LQ28BhyOZBQ 5:49:54](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=20994s) |
| chubut 2023 | 50 | Solo libre, música ciudadana: tango, milonga, vals o candombe. | [WGZAKE78uYo](https://www.youtube.com/watch?v=WGZAKE78uYo) |
| chubut 2023 | 51 | Solo libre, música de raíz afro: jazz, blues, spiritual o góspel. | [LQ28BhyOZBQ 7:27:23](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=26843s) |
| chubut 2023 | 51 | Solo libre, música de raíz afro: jazz, blues, spiritual o góspel. | [bjtrnMAZJfk](https://www.youtube.com/watch?v=bjtrnMAZJfk) |
| chubut 2023 | 51 | Solo libre, música de raíz afro: jazz, blues, spiritual o góspel. | [jJ4s81N5PFA](https://www.youtube.com/watch?v=jJ4s81N5PFA) |
| chubut 2023 | 51 | Solo libre, música de raíz afro: jazz, blues, spiritual o góspel. | [jUHY9zekYjU](https://www.youtube.com/watch?v=jUHY9zekYjU) |
| chubut 2023 | 52 | Pueblos originarios patagónicos. Solo libre para voz femenina o masculina, en lengua autóctona: obra de rep… | [nxpxtnpXGfE](https://www.youtube.com/watch?v=nxpxtnpXGfE) |
| chubut 2023 | 59 | Parti neu gôr teulu: hunanddewisiad. | [fqcw_P14K0A](https://www.youtube.com/watch?v=fqcw_P14K0A) |
| chubut 2023 | 60 | Parti neu gôr capel: hunanddewisiad. | [eBdNfYSFv3Y](https://www.youtube.com/watch?v=eBdNfYSFv3Y) |
| chubut 2023 | 60 | Parti neu gôr capel: hunanddewisiad. | [iJoP7cnrRU4](https://www.youtube.com/watch?v=iJoP7cnrRU4) |
| chubut 2023 | 62 | Dúo o trío académico: obra de Claudio Monteverdi a elección. | [V62LETLL_ZA](https://www.youtube.com/watch?v=V62LETLL_ZA) |
| chubut 2023 | 63 | Dúo libre: obra del repertorio popular. | [LQ28BhyOZBQ 7:56:24](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=28584s) |
| chubut 2023 | 63 | Dúo libre: obra del repertorio popular. | [UcLYzs5uYQE](https://www.youtube.com/watch?v=UcLYzs5uYQE) |
| chubut 2023 | 63 | Dúo libre: obra del repertorio popular. | [cr92LiYDyoM](https://www.youtube.com/watch?v=cr92LiYDyoM) |
| chubut 2023 | 63 | Dúo libre: obra del repertorio popular. | [u8Tv8RNKuAs](https://www.youtube.com/watch?v=u8Tv8RNKuAs) |
| chubut 2023 | 64 | Cuarteto mixto: himno a elección, en idioma no galés. | [EUtZrvORMXw](https://www.youtube.com/watch?v=EUtZrvORMXw) |
| chubut 2023 | 64 | Cuarteto mixto: himno a elección, en idioma no galés. | [LQ28BhyOZBQ 15:40](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=940s) |
| chubut 2023 | 64 | Cuarteto mixto: himno a elección, en idioma no galés. | [eBdNfYSFv3Y](https://www.youtube.com/watch?v=eBdNfYSFv3Y) |
| chubut 2023 | 64 | Cuarteto mixto: himno a elección, en idioma no galés. | [fqcw_P14K0A](https://www.youtube.com/watch?v=fqcw_P14K0A) |
| chubut 2023 | 66 | Pueblos originarios patagónicos. Conjunto en lengua autóctona: obra de repertorio académico o de autor, a e… | [V62LETLL_ZA](https://www.youtube.com/watch?v=V62LETLL_ZA) |
| chubut 2023 | 71 | Conjunto vocal libre con ensamble instrumental: música popular. | [-0VtD_5HIlA](https://www.youtube.com/watch?v=-0VtD_5HIlA) |
| chubut 2023 | 71 | Conjunto vocal libre con ensamble instrumental: música popular. | [3BvQV9muFHY](https://www.youtube.com/watch?v=3BvQV9muFHY) |
| chubut 2023 | 71 | Conjunto vocal libre con ensamble instrumental: música popular. | [WPHZUuDOS1s](https://www.youtube.com/watch?v=WPHZUuDOS1s) |
| chubut 2023 | 71 | Conjunto vocal libre con ensamble instrumental: música popular. | [alxvAZbv-y0](https://www.youtube.com/watch?v=alxvAZbv-y0) |
| chubut 2023 | 71 | Conjunto vocal libre con ensamble instrumental: música popular. | [sC3GSYUxH1g](https://www.youtube.com/watch?v=sC3GSYUxH1g) |
| chubut 2023 | 75 | Conjunto o coro de capilla: obra o arreglo a elección. | [EUtZrvORMXw](https://www.youtube.com/watch?v=EUtZrvORMXw) |
| chubut 2023 | 75 | Conjunto o coro de capilla: obra o arreglo a elección. | [LQ28BhyOZBQ 3:15:24](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=11724s) |
| chubut 2023 | 75 | Conjunto o coro de capilla: obra o arreglo a elección. | [fqcw_P14K0A](https://www.youtube.com/watch?v=fqcw_P14K0A) |
| chubut 2023 | 76 | Competencia principal para coro: «Ubi caritas», Gjeilo; spiritual, góspel o jazz a elección. | [7GeZCEDgcoc](https://www.youtube.com/watch?v=7GeZCEDgcoc) |
| chubut 2023 | 76 | Competencia principal para coro: «Ubi caritas», Gjeilo; spiritual, góspel o jazz a elección. | [8KefoF3wKo0](https://www.youtube.com/watch?v=8KefoF3wKo0) |
| chubut 2023 | 76 | Competencia principal para coro: «Ubi caritas», Gjeilo; spiritual, góspel o jazz a elección. | [LQ28BhyOZBQ 8:44:52](https://www.youtube.com/watch?v=LQ28BhyOZBQ&t=31492s) |
| chubut 2023 | 76 | Competencia principal para coro: «Ubi caritas», Gjeilo; spiritual, góspel o jazz a elección. | [x0-pSbbCHIA](https://www.youtube.com/watch?v=x0-pSbbCHIA) |
| chubut 2023 | 78 | Coro de libre formación: obra con puesta en escena o música de películas. | [HffK29rx9X0](https://www.youtube.com/watch?v=HffK29rx9X0) |
| chubut 2023 | 79 | Coro de libre formación: obra contemporánea a capella. | [Xg70oVF4y6A](https://www.youtube.com/watch?v=Xg70oVF4y6A) |
| chubut 2024 | 46 | Unawd canu emyn: hunanddewisiad. | [E7Mgjo1dIYs](https://www.youtube.com/watch?v=E7Mgjo1dIYs) |
| chubut 2024 | 48 | Solo libre, música de cámara: «An die Musik», Franz Schubert, o «Canción de cuna india», Gilardo Gilardi. | [VDCKHPXzibM 36:59](https://www.youtube.com/watch?v=VDCKHPXzibM&t=2219s) (ya identificada aquí: «An die Musik») |
| chubut 2024 | 49 | Solo, música folklórica argentina: obra a elección. | [Fh7i29-94XY](https://www.youtube.com/watch?v=Fh7i29-94XY) |
| chubut 2024 | 49 | Solo, música folklórica argentina: obra a elección. | [arqF7QHVMw0 1:00:34](https://www.youtube.com/watch?v=arqF7QHVMw0&t=3634s) |
| chubut 2024 | 50 | Solo libre, música rioplatense: obra a elección (tango, milonga, candombe). | [VDCKHPXzibM 2:44:02](https://www.youtube.com/watch?v=VDCKHPXzibM&t=9842s) |
| chubut 2024 | 51 | Solo libre, rock nacional: obra a elección. | [arqF7QHVMw0 3:08:57](https://www.youtube.com/watch?v=arqF7QHVMw0&t=11337s) |
| chubut 2024 | 59 | Parti neu gôr teulu: hunanddewisiad. | [8cqBxmsV8UQ](https://www.youtube.com/watch?v=8cqBxmsV8UQ) |
| chubut 2024 | 66 | Conjunto o coro familiar: obra o arreglo coral a elección. | [arqF7QHVMw0 2:59:02](https://www.youtube.com/watch?v=arqF7QHVMw0&t=10742s) |
| chubut 2024 | 72 | Competencia principal. Coro mixto: «Popule meus», Leonardo San Juan; obra original para coro de libre elecc… | [W1z_1ulc_lY](https://www.youtube.com/watch?v=W1z_1ulc_lY) |
| chubut 2024 | 75 | Coro de formación libre: obra con recursos de ambientación, movimiento o puesta escénica. | [VDCKHPXzibM 3:53:14](https://www.youtube.com/watch?v=VDCKHPXzibM&t=13994s) |
| chubut 2024 | 75 | Coro de formación libre: obra con recursos de ambientación, movimiento o puesta escénica. | [ZOkHkKylrZo](https://www.youtube.com/watch?v=ZOkHkKylrZo) |
| chubut 2024 | 76 | Coro de formación libre y conjunto instrumental: obra o arreglo de comedia musical. | [VDCKHPXzibM 3:17:02](https://www.youtube.com/watch?v=VDCKHPXzibM&t=11822s) |
| chubut 2024 | 76 | Coro de formación libre y conjunto instrumental: obra o arreglo de comedia musical. | [wpSYMGm72Bk](https://www.youtube.com/watch?v=wpSYMGm72Bk) |
| chubut 2025 | 47 | Unawd canu emyn: hunanddewisiad. | [3jRbxqunmSc](https://www.youtube.com/watch?v=3jRbxqunmSc) |
| chubut 2025 | 47 | Unawd canu emyn: hunanddewisiad. | [77ryTxS6J0Q](https://www.youtube.com/watch?v=77ryTxS6J0Q) (ya identificada aquí: «Ffarwél i Stesion Strata») |
| chubut 2025 | 47 | Unawd canu emyn: hunanddewisiad. | [P1UDkhDczBA](https://www.youtube.com/watch?v=P1UDkhDczBA) (ya identificada aquí: «Dyma gariad fel y moroedd») |
| chubut 2025 | 47 | Unawd canu emyn: hunanddewisiad. | [ZPpmyykLYXc](https://www.youtube.com/watch?v=ZPpmyykLYXc) |
| chubut 2025 | 47 | Unawd canu emyn: hunanddewisiad. | [aUh273i59MM](https://www.youtube.com/watch?v=aUh273i59MM) |
| chubut 2025 | 48 | Unawd cerdd dant: hunanddewisiad. | [Uc6M-ifLmOE](https://www.youtube.com/watch?v=Uc6M-ifLmOE) |
| chubut 2025 | 50 | Solo, música folklórica argentina: obra de Gustavo «Cuchi» Leguizamón, a elección. | [BC61L8txOaQ 7:18:16](https://www.youtube.com/watch?v=BC61L8txOaQ&t=26296s) |
| chubut 2025 | 51 | Solo libre, música ciudadana: tango o milonga a elección. | [F19X_4oFMiY](https://www.youtube.com/watch?v=F19X_4oFMiY) |
| chubut 2025 | 52 | Solo libre, rock nacional: tema de Serú Girán a elección. | [MIW7333GiIY 2:27:30](https://www.youtube.com/watch?v=MIW7333GiIY&t=8850s) |
| chubut 2025 | 52 | Solo libre, rock nacional: tema de Serú Girán a elección. | [Q5xCNF3y1k0](https://www.youtube.com/watch?v=Q5xCNF3y1k0) |
| chubut 2025 | 56 | Dúo libre: obra a elección de música popular argentina o latinoamericana. | [BC61L8txOaQ 8:10:34](https://www.youtube.com/watch?v=BC61L8txOaQ&t=29434s) |
| chubut 2025 | 58 | Parti cerdd dant: hunanddewisiad. | [Uc6M-ifLmOE](https://www.youtube.com/watch?v=Uc6M-ifLmOE) |
| chubut 2025 | 62 | Parti neu gôr teulu: hunanddewisiad. | [F19X_4oFMiY](https://www.youtube.com/watch?v=F19X_4oFMiY) |
| chubut 2025 | 62 | Parti neu gôr teulu: hunanddewisiad. | [rX3qlS2HzDw](https://www.youtube.com/watch?v=rX3qlS2HzDw) |
| chubut 2025 | 63 | Parti neu gôr capel: hunanddewisiad. | [Y0Az9sUWak0](https://www.youtube.com/watch?v=Y0Az9sUWak0) |
| chubut 2025 | 63 | Parti neu gôr capel: hunanddewisiad. | [a2d2G4Qljb8](https://www.youtube.com/watch?v=a2d2G4Qljb8) |
| chubut 2025 | 68 | Conjunto o coro familiar: obra a capella o con acompañamiento instrumental, a elección. | [BC61L8txOaQ 4:53:50](https://www.youtube.com/watch?v=BC61L8txOaQ&t=17630s) |
| chubut 2025 | 68 | Conjunto o coro familiar: obra a capella o con acompañamiento instrumental, a elección. | [F19X_4oFMiY](https://www.youtube.com/watch?v=F19X_4oFMiY) |
| chubut 2025 | 69 | Conjunto o coro de capilla: obra o arreglo en castellano, a capella o con acompañamiento instrumental. | [BC61L8txOaQ 1:29:38](https://www.youtube.com/watch?v=BC61L8txOaQ&t=5378s) |
| chubut 2025 | 69 | Conjunto o coro de capilla: obra o arreglo en castellano, a capella o con acompañamiento instrumental. | [aUh273i59MM](https://www.youtube.com/watch?v=aUh273i59MM) |
| chubut 2025 | 75 | Segunda competencia principal, coro mixto, femenino o masculino: a) «Rosa Amarela», Heitor Villalobos (vers… | [BC61L8txOaQ 8:58:54](https://www.youtube.com/watch?v=BC61L8txOaQ&t=32334s) (ya identificada aquí: «Bonita rama de sauce») |
| chubut 2025 | 75 | Segunda competencia principal, coro mixto, femenino o masculino: a) «Rosa Amarela», Heitor Villalobos (vers… | [h5zX7SaZJt8](https://www.youtube.com/watch?v=h5zX7SaZJt8) (ya identificada aquí: «Bonita rama de sauce») |
| chubut 2025 | 77 | Coro de formación libre: obra con uso de recursos de ambientación, movimiento o puesta escénica, a elección. | [MIW7333GiIY 3:25:20](https://www.youtube.com/watch?v=MIW7333GiIY&t=12320s) |
| chubut 2025 | 77 | Coro de formación libre: obra con uso de recursos de ambientación, movimiento o puesta escénica, a elección. | [ptNmB1_jJsI](https://www.youtube.com/watch?v=ptNmB1_jJsI) |
| chubut 2025 | 78 | Coro de formación libre y conjunto instrumental de formación libre: obra original o arreglo de libre elección. | [KKQJfmCIACk](https://www.youtube.com/watch?v=KKQJfmCIACk) |
| chubut 2025 | 78 | Coro de formación libre y conjunto instrumental de formación libre: obra original o arreglo de libre elección. | [MIW7333GiIY 4:37:40](https://www.youtube.com/watch?v=MIW7333GiIY&t=16660s) |
| chubut 2025 | 79 | Competencia especial. Comedia musical: tema «160 aniversario del arribo de los colonos galeses a las costas… | [BC61L8txOaQ 1:07:24](https://www.youtube.com/watch?v=BC61L8txOaQ&t=4044s) |
| chubut 2025 | 79 | Competencia especial. Comedia musical: tema «160 aniversario del arribo de los colonos galeses a las costas… | [cbz09too6U0](https://www.youtube.com/watch?v=cbz09too6U0) |
| chubut 2026 | 55 | Solo libre, música ciudadana: tango o milonga a elección. | [hVtD63KLlsw 5:59:20](https://www.youtube.com/watch?v=hVtD63KLlsw&t=21560s) (ya identificada aquí: «Desencuentro») |
| chubut 2026 | 56 | Solo libre, rock nacional: tema a elección de Charly García. | [cDpe89FFjOA 1:57:29](https://www.youtube.com/watch?v=cDpe89FFjOA&t=7049s) (ya identificada aquí: «Desarma y Sangra») |
| chubut 2026 | 61 | Dúo libre: obra a elección de música popular argentina o latinoamericana. | [hVtD63KLlsw 8:43:59](https://www.youtube.com/watch?v=hVtD63KLlsw&t=31439s) (ya identificada aquí: «Ríe Chinito») |
| chubut 2026 | 73 | Conjunto o coro familiar: obra a capella o con acompañamiento instrumental. | [hVtD63KLlsw 4:38:03](https://www.youtube.com/watch?v=hVtD63KLlsw&t=16683s) |
| chubut 2026 | 74 | Conjunto o coro de capilla: obra o arreglo en castellano. | [hVtD63KLlsw 4:37:36](https://www.youtube.com/watch?v=hVtD63KLlsw&t=16656s) |
| chubut 2026 | 82 | Coro de formación libre y conjunto instrumental de formación libre: obra original o arreglo a elección. | [cDpe89FFjOA 6:31:04](https://www.youtube.com/watch?v=cDpe89FFjOA&t=23464s) |
| trevelin 2021 | 43 | Parti hyd at 25 aelod: trefniant o unrhyw un o ganeuon Dafydd Iwan. | [s0dh-eG-jzA](https://www.youtube.com/watch?v=s0dh-eG-jzA) |
| trevelin 2021 | 97 | Solo femenino: obra a elección. | [EUHjpZkkUpM](https://www.youtube.com/watch?v=EUHjpZkkUpM) |
| trevelin 2021 | 97 | Solo femenino: obra a elección. | [txxZGsFsWzs](https://www.youtube.com/watch?v=txxZGsFsWzs) |
| trevelin 2021 | 100 | Solo libre: obra a elección. | [QZ8ee-pnlCI](https://www.youtube.com/watch?v=QZ8ee-pnlCI) |
| trevelin 2021 | 101 | Dúo libre: obra a elección. | [SVHWzsQq3R8](https://www.youtube.com/watch?v=SVHWzsQq3R8) |
| trevelin 2021 | 101 | Dúo libre: obra a elección. | [awKGliA-DnI](https://www.youtube.com/watch?v=awKGliA-DnI) |
| trevelin 2021 | 101 | Dúo libre: obra a elección. | [txxZGsFsWzs](https://www.youtube.com/watch?v=txxZGsFsWzs) |
| trevelin 2021 | 105 | Conjunto vocal de al menos tres generaciones: obra a elección. | [s0dh-eG-jzA](https://www.youtube.com/watch?v=s0dh-eG-jzA) |
| trevelin 2024 | 43 | Unawd canu emyn: hunanddewisiad. | [c3H8zOf1eCg](https://www.youtube.com/watch?v=c3H8zOf1eCg) |
