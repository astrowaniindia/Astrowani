-- Reword Wani Shop items that made medical / life-saving promises (2026-09-16).
--
-- WHY: App Store review (Guideline 1.4.1, physical harm) and Google Play both reject
-- apps whose listings claim to cure illness or prevent death. The worst one told
-- customers a puja "will revoke death if critical condition in hospital", which could
-- put someone off seeking medical care. The rewording keeps what each item IS and
-- the spiritual intent, and removes promises about health outcomes.
--
-- Rule for future copy (admin -> Remedies / Wani Shop): describe the ritual or the
-- object and the blessing it is traditionally performed for. Never promise a medical
-- result ("cures", "removes illness", "safe pregnancy", "prevents death",
-- "guaranteed"), and never suggest it replaces a doctor.
--
-- ROLLBACK: the original text of every row is recorded in the comment above its update.

-- 1. Maha Mrityunjay Puja
-- was title:    'For Revoke Death Maha Mratyunjay Puja'
-- was title_hi: 'मृत्यु निरस्त करने के लिए महा मृत्युंजय पूजा'
-- was description: 'The Maha Mrityunjay Puja is a powerful Vedic ritual dedicated to Lord Shiva to overcome fears, cure severe illnesses, and seek protection from premature death (Akal Mrityu). Centered around chanting the Rigvedic Tryambakam mantra, it involves a online Sankalp (vow), Abhishek, the chanting of 1,25,000 mantras by our priests, and a concluding Havan. in emergency must do this it will revoke death if critical condition in hospital also'
-- was description_hi: 'महा मृत्युंजय पूजा एक शक्तिशाली वैदिक अनुष्ठान है जो भगवान शिव को भय को दूर करने, गंभीर बीमारियों को ठीक करने और समय से पहले मृत्यु (अकाल मृत्यु) से सुरक्षा पाने के लिए समर्पित है। ऋग्वेदिक त्र्यंबकम मंत्र का जप करने के आसपास केंद्रित, इसमें एक ऑनलाइन संकल्प (व्रत), अभिषेक, हमारे पुजारियों द्वारा 1,25,000 मंत्रों का जप, और एक समापन हवन शामिल है। आपातकाल में ऐसा करना चाहिए यह अस्पताल में भी गंभीर स्थिति होने पर मृत्यु को रद्द कर देगा'
UPDATE public.remedy_items SET
  title = 'Maha Mrityunjay Puja',
  title_hi = 'महा मृत्युंजय पूजा',
  description = 'The Maha Mrityunjay Puja is a Vedic ritual dedicated to Lord Shiva, traditionally performed to seek courage, peace of mind, and blessings for a long and healthy life. It includes an online Sankalp (vow), Abhishek, the chanting of 1,25,000 Tryambakam mantras by our priests, and a concluding Havan. This puja is a spiritual practice and is not a substitute for medical care; anyone who is unwell should always follow their doctor''s advice.',
  description_hi = 'महा मृत्युंजय पूजा भगवान शिव को समर्पित एक वैदिक अनुष्ठान है, जो परंपरागत रूप से साहस, मन की शांति और लंबे व स्वस्थ जीवन के आशीर्वाद के लिए किया जाता है। इसमें ऑनलाइन संकल्प, अभिषेक, हमारे पुजारियों द्वारा त्र्यंबकम मंत्र का 1,25,000 बार जप और समापन हवन शामिल है। यह पूजा एक आध्यात्मिक अभ्यास है और चिकित्सा उपचार का विकल्प नहीं है; अस्वस्थ होने पर हमेशा अपने डॉक्टर की सलाह का पालन करें।'
WHERE id = 'bffe1081-28ee-40d0-a08d-c26e1986e428';

-- 2. Santan Gopal Puja
-- was title:    'Powerful Santan Prapti Puja'
-- was title_hi: 'शक्तिशाली संतन प्रप्ति पूजा'
-- was description: 'Santan Gopal Puja invokes Lord Krishna in his infant form (Bal Gopal) to bless couples with healthy, virtuous progeny, overcome fertility obstacles, and ensure a safe, complication-free pregnancy, must require to participate couple online 3 hours without disturbance  '
-- was description_hi: 'संतन गोपाल पूजा ने भगवान कृष्ण को अपने शिशु रूप (बाल गोपाल) में स्वस्थ, पुण्य संतान के साथ जोड़ों को आशीर्वाद देने, प्रजनन बाधाओं को दूर करने और एक सुरक्षित, जटिलता मुक्त गर्भावस्था सुनिश्चित करने के लिए, बिना किसी गड़बड़ी के 3 घंटे ऑनलाइन भाग लेने की आवश्यकता होनी चाहिए।'
UPDATE public.remedy_items SET
  title = 'Santan Gopal Puja',
  title_hi = 'संतान गोपाल पूजा',
  description = 'Santan Gopal Puja invokes Lord Krishna in his infant form (Bal Gopal) to seek blessings for couples who wish to start a family. Both partners take part online for about 3 hours without interruption. This puja is a spiritual practice and does not replace medical advice or fertility treatment.',
  description_hi = 'संतान गोपाल पूजा में भगवान कृष्ण के बाल रूप (बाल गोपाल) का आह्वान किया जाता है, ताकि परिवार शुरू करने की इच्छा रखने वाले दंपति आशीर्वाद प्राप्त कर सकें। दोनों पति-पत्नी लगभग 3 घंटे बिना किसी व्यवधान के ऑनलाइन भाग लेते हैं। यह पूजा एक आध्यात्मिक अभ्यास है और चिकित्सा सलाह या प्रजनन उपचार का विकल्प नहीं है।'
WHERE id = '72c49448-7469-48e2-9fe2-7a518f9c5c4a';

-- 3. Vastu Dosh Nivaran Puja
-- was description: 'Vastu Dosh Nivaran Puja (Vastu Shanti) is a Vedic ritual dedicated to the Vastu Purush to correct architectural faults, remove negative energy, and restore balance to the five natural elements in your home. It invites peace, health, and prosperity into the property. without any changes in structure of property Really very effective '
-- was description_hi: 'वास्तु दोष निवारण पूजा (वास्तु शांति) वास्तु पुरुष को समर्पित एक वैदिक अनुष्ठान है जो वास्तु दोषों को ठीक करने, नकारात्मक ऊर्जा को हटाने और आपके घर में पांच प्राकृतिक तत्वों को संतुलित करने के लिए समर्पित है। यह संपत्ति में शांति, स्वास्थ्य और समृद्धि को आमंत्रित करता है। संपत्ति की संरचना में किसी भी बदलाव के बिना वास्तव में बहुत प्रभावी'
UPDATE public.remedy_items SET
  title = 'Special Vastu Dosh Nivaran Puja for Home or Business Place',
  description = 'Vastu Dosh Nivaran Puja (Vastu Shanti) is a Vedic ritual dedicated to the Vastu Purush, traditionally performed to seek harmony among the five natural elements in your home or workplace and to invite peace and positivity. No structural changes to the property are needed.',
  description_hi = 'वास्तु दोष निवारण पूजा (वास्तु शांति) वास्तु पुरुष को समर्पित एक वैदिक अनुष्ठान है, जो परंपरागत रूप से आपके घर या कार्यस्थल में पांच प्राकृतिक तत्वों के बीच सामंजस्य और शांति व सकारात्मकता के लिए किया जाता है। संपत्ति की संरचना में किसी बदलाव की आवश्यकता नहीं है।'
WHERE id = 'f9bc569d-88d0-433f-ae72-ac998852a3a2';

-- 4-6. Vastu products whose titles said "Cure"
-- was: 'Axis Pyramid [Cure Multiple Vastu Defects at Home and Office]'
UPDATE public.remedy_items SET title = 'Axis Pyramid [Vastu Remedy for Home and Office]'
WHERE id = 'd3777409-d279-47c5-a0b8-bda95d5f1f56';
-- was: 'North East Bathroom Crystal Remedies Cure'
UPDATE public.remedy_items SET title = 'North East Bathroom Crystal Vastu Remedy'
WHERE id = 'a5b0adfb-1f52-4aa5-aba9-25fb0f983169';
-- was: 'Space-X Swastika [Cure Multiple Vastu Defect at Home, Office, Business]'
UPDATE public.remedy_items SET title = 'Space-X Swastika [Vastu Remedy for Home, Office, Business]'
WHERE id = '1dd623e2-f067-4d34-b976-eb29dfa1eb49';

-- 7. A pyramid sold for "charging" medicine
-- was: 'Jiten Medicine 9x 9 ( Medicine Charging )'
UPDATE public.remedy_items SET title = 'Jiten 9x9 Pyramid Plate'
WHERE id = '532a13e0-d3df-4f46-91bb-76354dfc9337';
