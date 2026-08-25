-- Vastu Remedies catalogue seed.
--
-- Generated 2026-08-25 from the supplier's published catalogue. Astrowani sources these
-- from the same supplier, so the products, their specifications and their prices are the
-- same goods - that is what is reproduced here.
--
-- WHAT IS AND IS NOT IN THIS FILE:
--   * title, price, mrp, group and image  - yes. Facts about the goods.
--   * description                          - NO. Deliberately left NULL. The wording on the
--     source listing is somebody's copywriting, not a property of the product. Write your
--     own, or ask and I will draft them.
--
-- Images are served from shop.astrowani.com/assets/vastu/ - the shop's own origin, not
-- hotlinked from anyone else's CDN - so they keep working if that site changes, and the
-- customer app can load the same absolute URL.
--
-- Idempotent: every row is guarded on (type, title), so re-running inserts nothing twice
-- and adds only products that are new.
--
-- RUN sql/vastu_category.sql AND sql/vastu_subcategory.sql FIRST.
--   The first seeds the ordering gate and the commission rate; the second adds the
--   subcategory column this file writes to.

BEGIN;

INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Helix for South East Vastu Dosh - 3 Pcs Set with Placement Guide for Agneya Kon Cut, Toilet, Kitchen', NULL, 1800.00, 2999.00, 'https://shop.astrowani.com/assets/vastu/copper-helix-for-south-east-vastu-dosh-cut-extension-defects-3pcs.jpg', 'Pyramids', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Helix for South East Vastu Dosh - 3 Pcs Set with Placement Guide for Agneya Kon Cut, Toilet, Kitchen');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lead Helix Vastu Remedies for South West Entrance, Main Door, Kitchen, Toilet Correction at Home, Office, Plot, Business, Shop (3pcs)', NULL, 1600.00, 2999.00, 'https://shop.astrowani.com/assets/vastu/prithvi-earth-lead-helix-vastu-3pcs-for-south-west-correction.jpg', 'Pyramids', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lead Helix Vastu Remedies for South West Entrance, Main Door, Kitchen, Toilet Correction at Home, Office, Plot, Business, Shop (3pcs)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Ishanya Zinc Helix, North-East Vastu Dosha Remedy, 4 inch', NULL, 1600.00, 2999.00, 'https://shop.astrowani.com/assets/vastu/ishanya-zinc-helix-north-east-vastu-dosha-remedies-3pcs.jpg', 'Pyramids', true, 2
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Ishanya Zinc Helix, North-East Vastu Dosha Remedy, 4 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Pyramid for Vastu - Powerful Remedy for Positive Energy at Home, Office, Factory and Plot', NULL, 3800.00, 3000.00, 'https://shop.astrowani.com/assets/vastu/copper-vastu-pyramid-set-4inch.jpg', 'Pyramids', true, 3
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Pyramid for Vastu - Powerful Remedy for Positive Energy at Home, Office, Factory and Plot');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Zinc Helix for Vastu - North-East Cut and Ishanya Dosh Remedy for Toilet, Bedroom, Kitchen, Home and Office', NULL, 550.00, 999.00, 'https://shop.astrowani.com/assets/vastu/ishanya-zinc-helix-north-east-vastu-dosha-remedies.jpg', 'Pyramids', true, 4
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Zinc Helix for Vastu - North-East Cut and Ishanya Dosh Remedy for Toilet, Bedroom, Kitchen, Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Helix Vastu Remedies for South-East Cut, Main Door Entrance, Kitchen, Bedroom Vaastu Dosh Defects', NULL, 600.00, 999.00, 'https://shop.astrowani.com/assets/vastu/copper-helix-for-south-east-vastu-dosh-cut-extension-defects.jpg', 'Pyramids', true, 5
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Helix Vastu Remedies for South-East Cut, Main Door Entrance, Kitchen, Bedroom Vaastu Dosh Defects');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Helix 6 inch for Vastu - South-East Cut and Dosh Remedy for Home, Office and Plot', NULL, 2950.00, 5000.00, 'https://shop.astrowani.com/assets/vastu/copper-helix-6inch-vastu-remedies-for-south-east-3pcs.jpg', 'Pyramids', true, 6
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Helix 6 inch for Vastu - South-East Cut and Dosh Remedy for Home, Office and Plot');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Helix for Vastu - North-West Cut and Dosh Remedy for Main Door, Kitchen, Bedroom, Home and Office', NULL, 1800.00, 2999.00, 'https://shop.astrowani.com/assets/vastu/brass-helix-vastu-remedies-for-north-west-3pc.jpg', 'Pyramids', true, 7
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Helix for Vastu - North-West Cut and Dosh Remedy for Main Door, Kitchen, Bedroom, Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Swastik Pyramid for Vastu - Positive Energy and Dosh Remedy for Home, Office and Factory', NULL, 450.00, 600.00, 'https://shop.astrowani.com/assets/vastu/copper-swastik-pyramid-vastu-remedies-home-office.jpg', 'Pyramids', true, 8
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Swastik Pyramid for Vastu - Positive Energy and Dosh Remedy for Home, Office and Factory');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Helix Vastu Remedies for North-West Vaastu Defects Like Entrance, Toilet, Kitchen, Extended Corner and Cuts', NULL, 650.00, 999.00, 'https://shop.astrowani.com/assets/vastu/brass-helix-vastu-remedies-for-north-west-1pc.jpg', 'Pyramids', true, 9
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Helix Vastu Remedies for North-West Vaastu Defects Like Entrance, Toilet, Kitchen, Extended Corner and Cuts');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Zinc Helix 6inch Vastu Dosh Remedies for North East Vastu Defect or Corner Cuts (3pcs)', NULL, 2950.00, 5000.00, 'https://shop.astrowani.com/assets/vastu/zinc-helix-6inch-vastu-dosh-remedies-for-north-east-3pcs.jpg', 'Pyramids', true, 10
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Zinc Helix 6inch Vastu Dosh Remedies for North East Vastu Defect or Corner Cuts (3pcs)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Sun Wall Hanging for Vastu - Surya Dev Remedy for Missing East Window, Home and Office, 6 inch', NULL, 2550.00, 2600.00, 'https://shop.astrowani.com/assets/vastu/copper-vastu-sun-surya-6inch.jpg', 'Vastu Enhancer', true, 11
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Sun Wall Hanging for Vastu - Surya Dev Remedy for Missing East Window, Home and Office, 6 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shriparni Wooden Cash Box for Vastu - Wealth and Money Box for Home Locker and Shop Counter', NULL, 1450.00, 1800.00, 'https://shop.astrowani.com/assets/vastu/auspicious-sriparni-wooden-wealth-money-vastu-cash-box.jpg', 'Vastu Enhancer', true, 12
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shriparni Wooden Cash Box for Vastu - Wealth and Money Box for Home Locker and Shop Counter');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Tibetan Om Bell for Space Cleansing - Negative Energy Removal and Positive Vibrations, 7 Metal', NULL, 2900.00, 4000.00, 'https://shop.astrowani.com/assets/vastu/tibetan-om-bell-space-meditation-sound-healing.jpg', 'Feng Shui', true, 13
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Tibetan Om Bell for Space Cleansing - Negative Energy Removal and Positive Vibrations, 7 Metal');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Ishanya Vastu Zinc Pyramid North East Corner Cut, Toilet, Kitchen, Bedroom Vastu Dosh Correction', NULL, 500.00, 999.00, 'https://shop.astrowani.com/assets/vastu/ishanya-zinc-pyramid-1inch.jpg', 'Pyramids', true, 14
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Ishanya Vastu Zinc Pyramid North East Corner Cut, Toilet, Kitchen, Bedroom Vastu Dosh Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Prithvi Earth Lead Helix Vastu for Southwest Cut, Toilet, Kitchen, Entrance, Main Door Vastu Dosh Remedies for Home and Office', NULL, 550.00, 999.00, 'https://shop.astrowani.com/assets/vastu/prithvi-earth-lead-helix-vastu-for-southwest.jpg', 'Pyramids', true, 15
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Prithvi Earth Lead Helix Vastu for Southwest Cut, Toilet, Kitchen, Entrance, Main Door Vastu Dosh Remedies for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Om Swastik Trishul Trishakti Yantra - Vastu Protection and Positivity for Home and Office Entrance', NULL, 400.00, 450.00, 'https://shop.astrowani.com/assets/vastu/trishakti-yantra-om-swastik-trishul-home-entrance-main-door.jpg', 'Vastu Enhancer', true, 16
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Om Swastik Trishul Trishakti Yantra - Vastu Protection and Positivity for Home and Office Entrance');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brahma Pyramid for Brahmasthan - Center Vastu Dosh Remedy for Home, Office and Factory', NULL, 1650.00, 1850.00, 'https://shop.astrowani.com/assets/vastu/brahma-pyramid.jpg', 'Pyramids', true, 17
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brahma Pyramid for Brahmasthan - Center Vastu Dosh Remedy for Home, Office and Factory');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Copper Pyramid Shift Arrow Quick Vastu Remedies for Virtual Shifting of Kitchen, Toilet, Bedroom', NULL, 550.00, 650.00, 'https://shop.astrowani.com/assets/vastu/vastu-copper-pyramid-shift-arrow.jpg', 'Pyramids', true, 18
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Copper Pyramid Shift Arrow Quick Vastu Remedies for Virtual Shifting of Kitchen, Toilet, Bedroom');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Super Brass Helix for Vastu Dosh Nivaran', NULL, 1450.00, 2999.00, 'https://shop.astrowani.com/assets/vastu/vastu-super-brass-helix-for-vastu-dosh-nivaran.jpg', 'Pyramids', true, 19
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Super Brass Helix for Vastu Dosh Nivaran');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Strip Pyramid Divider for Vastu - Remedy for Wrong Toilet Direction, Cuts and Extensions', NULL, 700.00, 850.00, 'https://shop.astrowani.com/assets/vastu/vastu-copper-strip-pyramid-divider.jpg', 'Pyramids', true, 20
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Strip Pyramid Divider for Vastu - Remedy for Wrong Toilet Direction, Cuts and Extensions');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Wooden Meru Shriparni (Sevan or Saven) Vastu Shri Yantra For Home and Office [Temple and North-East]', NULL, 2100.00, 2399.00, 'https://shop.astrowani.com/assets/vastu/meru-sriparni-sevan-saven-vastu-shri-yantra.jpg', 'Pyramids', true, 21
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Wooden Meru Shriparni (Sevan or Saven) Vastu Shri Yantra For Home and Office [Temple and North-East]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Crystal for Bathroom, Toilet, Restroom for Vastu Remedies and Defect at Home or Office [Bronze Bowl]', NULL, 1200.00, 1400.00, 'https://shop.astrowani.com/assets/vastu/crystal-bathroom-toilet-washroom.jpg', 'Crystals', true, 22
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Crystal for Bathroom, Toilet, Restroom for Vastu Remedies and Defect at Home or Office [Bronze Bowl]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Salt Himalayan Rock Salt - Negative Energy Removal and Space Purification for Home and Office', NULL, 400.00, 600.00, 'https://shop.astrowani.com/assets/vastu/himalayan-pink-rock-salt.jpg', 'Vastu Enhancer', true, 23
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Salt Himalayan Rock Salt - Negative Energy Removal and Space Purification for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Copper Pyramid Strip for Toilet Defects or Cut Extention', NULL, 490.00, 650.00, 'https://shop.astrowani.com/assets/vastu/vastu-copper-pyramid-strip-for-toilet-defects-or-division.jpg', 'Pyramids', true, 24
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Copper Pyramid Strip for Toilet Defects or Cut Extention');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lead Pyramid Vastu For South West Vastu Defect Remedies For Home, Offices, Factory, Plot (Size: 1 Inch)', NULL, 1350.00, 2499.00, 'https://shop.astrowani.com/assets/vastu/lead-pyramid-1inch.jpg', 'Pyramids', true, 25
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lead Pyramid Vastu For South West Vastu Defect Remedies For Home, Offices, Factory, Plot (Size: 1 Inch)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Panchdhatu Pyramid Swastik Vastu Remedies for Home, Office - Goodluck, Auspicious, Religious symbols | Pooja Idols | Home Decor', NULL, 999.00, 1299.00, 'https://shop.astrowani.com/assets/vastu/panchdhatu-pyramid-swastik.jpg', 'Pyramids', true, 26
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Panchdhatu Pyramid Swastik Vastu Remedies for Home, Office - Goodluck, Auspicious, Religious symbols | Pooja Idols | Home Decor');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Pyramid Arrow Vastu Remedies for Anti Clock Main Door, Entrance, Staircase and Anti Clock Factory Production Process', NULL, 550.00, 650.00, 'https://shop.astrowani.com/assets/vastu/copper-pyramid-arrow-vastu-remedies-for-anti-clock-door-staircase.jpg', 'Pyramids', true, 27
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Pyramid Arrow Vastu Remedies for Anti Clock Main Door, Entrance, Staircase and Anti Clock Factory Production Process');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brahma Pyramid for Vastu Dosh Nivaran of Brahmasthan Center of House', NULL, 1150.00, 1350.00, 'https://shop.astrowani.com/assets/vastu/brahma-pyramid-brahmasthan-vastu-remedies.jpg', 'Pyramids', true, 28
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brahma Pyramid for Vastu Dosh Nivaran of Brahmasthan Center of House');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Ishanya Vastu Zinc Pyramid North East Cut, Kitchen, Toilet, Bedroom Vastu Dosh Remedies 2.5 Inches', NULL, 1400.00, 2999.00, 'https://shop.astrowani.com/assets/vastu/ishanya-vastu-zinc-pyramid-north-east.jpg', 'Pyramids', true, 29
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Ishanya Vastu Zinc Pyramid North East Cut, Kitchen, Toilet, Bedroom Vastu Dosh Remedies 2.5 Inches');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Owl Handicraft Fengshui Vaastu Symbol of Good Luck, Wisdom and Protection Decorative Showpiece Statue | Home and Office Decor', NULL, 1450.00, 1550.00, 'https://shop.astrowani.com/assets/vastu/brass-handicraft-owl-fengshui-vastu.jpg', 'Feng Shui', true, 30
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Owl Handicraft Fengshui Vaastu Symbol of Good Luck, Wisdom and Protection Decorative Showpiece Statue | Home and Office Decor');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Wooden Pyramid Wish Box, Reiki Box, Cash Box with Yantra Stickers for Home and Office', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/vastu-wooden-pyramid-wish-reiki-cash-box-yantra.jpg', 'Pyramids', true, 31
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Wooden Pyramid Wish Box, Reiki Box, Cash Box with Yantra Stickers for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Feng Shui Ship With Ingot and Crystals for Abundance of Wealth', NULL, 2550.00, 2750.00, 'https://shop.astrowani.com/assets/vastu/vastu-feng-shui-ship-with-coins-ingot.jpg', 'Feng Shui', true, 32
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Feng Shui Ship With Ingot and Crystals for Abundance of Wealth');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Panchmukhi Hanuman Brass Statue for Main Door - South and South-West Vastu Protection, Home and Office', NULL, 1250.00, 1600.00, 'https://shop.astrowani.com/assets/vastu/brass-panchmukhi-mahabali-hanuman-statue-idol.jpg', 'Vastu Enhancer', true, 33
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Panchmukhi Hanuman Brass Statue for Main Door - South and South-West Vastu Protection, Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Protect Your New Car With Pyramid - Energy Tool for Car Safety', NULL, 1100.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/jiten-car-pyramid-vastu-remedies.jpg', 'Pyramids', true, 34
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Protect Your New Car With Pyramid - Energy Tool for Car Safety');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Good Luck Horse Shoe Made in Copper With Pyramid', NULL, 650.00, 850.00, 'https://shop.astrowani.com/assets/vastu/copper-pyramid-good-luck-horse-shoe.jpg', 'Feng Shui', true, 35
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Good Luck Horse Shoe Made in Copper With Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Diamond Swastik Pyramid', NULL, 930.00, 1250.00, 'https://shop.astrowani.com/assets/vastu/vastu-diamond-swastik-pyramid.jpg', 'Pyramids', true, 36
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Diamond Swastik Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Electro Stress Crystal Grid - Vastu Rectification with Sacred Geometrical Frame', NULL, 1850.00, 2150.00, 'https://shop.astrowani.com/assets/vastu/electro-stress-crystal-grid-vastu-rectification.jpg', 'Crystals', true, 37
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Electro Stress Crystal Grid - Vastu Rectification with Sacred Geometrical Frame');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Crystal Navagraha Pyramid - Nine Planet Pyramid', NULL, 850.00, 900.00, 'https://shop.astrowani.com/assets/vastu/crystal-navagraha-pyramid-nine-planet.jpg', 'Crystals', true, 38
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Crystal Navagraha Pyramid - Nine Planet Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Feng Shui Vastu Bell 3 Bell 6 Coins - Home and Office Main Door (Big Size)', NULL, 800.00, 850.00, 'https://shop.astrowani.com/assets/vastu/feng-shui-vastu-bell-3-bell-6-coins.jpg', 'Feng Shui', true, 39
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Feng Shui Vastu Bell 3 Bell 6 Coins - Home and Office Main Door (Big Size)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Pyramid 1inch - Vastu RemediesFor North-West Entrance, Main Door, Kitchen, Toilet, Bedroom', NULL, 1150.00, 1400.00, 'https://shop.astrowani.com/assets/vastu/brass-pyramid-set-1inch.jpg', 'Pyramids', true, 40
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Pyramid 1inch - Vastu RemediesFor North-West Entrance, Main Door, Kitchen, Toilet, Bedroom');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Lion Statue Feng Shui Vastu Shastra Indian Decor Handicraft and Home Decor Product', NULL, 1500.00, 1950.00, 'https://shop.astrowani.com/assets/vastu/brass-lion-feng-shui-vastu-decor-handicraft.jpg', 'Feng Shui', true, 41
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Lion Statue Feng Shui Vastu Shastra Indian Decor Handicraft and Home Decor Product');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Fire Pyramid South East Vastu Remedy', NULL, 750.00, 850.00, 'https://shop.astrowani.com/assets/vastu/fire-pyramid-southeast-vastu.jpg', 'Pyramids', true, 42
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Fire Pyramid South East Vastu Remedy');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Water Pyramid for North East Dosha Defects', NULL, 630.00, 650.00, 'https://shop.astrowani.com/assets/vastu/vastu-water-pyramid-for-north-east.jpg', 'Pyramids', true, 43
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Water Pyramid for North East Dosha Defects');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Copper Pyramid Set 2.5 Inch for Home, Office, Plots [Positive Vibrations and Energy]', NULL, 1800.00, 1500.00, 'https://shop.astrowani.com/assets/vastu/copper-vastu-pyramid-set-2-5-inch.jpg', 'Pyramids', true, 44
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Copper Pyramid Set 2.5 Inch for Home, Office, Plots [Positive Vibrations and Energy]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Personal Work/Office Space Vastu Pyramid Grid', NULL, 1250.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/personal-workspace-vastu-pyramid-grid.jpg', 'Crystals', true, 45
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Personal Work/Office Space Vastu Pyramid Grid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Blue Swastik Pyramid 2.5inch Pair for Vastu Remedies', NULL, 300.00, 350.00, 'https://shop.astrowani.com/assets/vastu/blue-swastik-pyramid-vastu-remedies.jpg', 'Pyramids', true, 46
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Blue Swastik Pyramid 2.5inch Pair for Vastu Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Red Swastik Pyramid 2.5'''' Pair Vastu Remedies', NULL, 280.00, 480.00, 'https://shop.astrowani.com/assets/vastu/red-swastik-pyramid-vastu-remedies.jpg', 'Pyramids', true, 47
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Red Swastik Pyramid 2.5'''' Pair Vastu Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Vastu Dosh Nivaran Pyramid Yantra for Home and Office Temple', NULL, 1100.00, 1500.00, 'https://shop.astrowani.com/assets/vastu/vastu-dosh-nivaran-pyramid-yantra-copper.jpg', 'Pyramids', true, 48
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Vastu Dosh Nivaran Pyramid Yantra for Home and Office Temple');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Cork Swastik 3inch - Vastu Remedies for Overhead Beams, Pillars in Brahmasthan,', NULL, 300.00, 500.00, 'https://shop.astrowani.com/assets/vastu/cork-swastik-3inch-vastu-remedies.jpg', 'Vastu Enhancer', true, 49
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Cork Swastik 3inch - Vastu Remedies for Overhead Beams, Pillars in Brahmasthan,');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Gomti Chakra Set for Vastu - Rare Gomati Chakra for Wealth, Protection and Astrology Remedies, 11pcs', NULL, 500.00, 700.00, 'https://shop.astrowani.com/assets/vastu/gomti-chakra.jpg', NULL, true, 50
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Gomti Chakra Set for Vastu - Rare Gomati Chakra for Wealth, Protection and Astrology Remedies, 11pcs');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Axis Pyramid [Cure Multiple Vastu Defects at Home and Office]', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/axis-pyramid-vastu-fengshui-correction-remedies.jpg', 'Pyramids', true, 51
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Axis Pyramid [Cure Multiple Vastu Defects at Home and Office]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Feng Shui Black Agate Tortoise with Brass Plate', NULL, 900.00, 1100.00, 'https://shop.astrowani.com/assets/vastu/vastu-feng-shui-black-agate-tortoise.jpg', 'Feng Shui', true, 52
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Feng Shui Black Agate Tortoise with Brass Plate');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Green Swastik Pyramid 2.5inch Pair for Vastu Remedies', NULL, 300.00, 350.00, 'https://shop.astrowani.com/assets/vastu/green-swastik-pyramid-vastu-remedies.jpg', 'Pyramids', true, 53
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Green Swastik Pyramid 2.5inch Pair for Vastu Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Vastu Pyramid Products and Remedies for Home, Temple, Main Door, Kitchen, Bedroom (3.5-inches, Hollow Dome)', NULL, 850.00, 999.00, 'https://shop.astrowani.com/assets/vastu/vastu-copper-pyramid-3-5inch-top-dome-hollow.jpg', 'Pyramids', true, 54
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Vastu Pyramid Products and Remedies for Home, Temple, Main Door, Kitchen, Bedroom (3.5-inches, Hollow Dome)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Dik Dosh Nashak Vastu Yantra [Framed]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/vastu-dik-dosh-nahsak-yantra.jpg', 'Vastu Enhancer', true, 55
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Dik Dosh Nashak Vastu Yantra [Framed]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Wooden Ashoka Pillar Ashok Stambh for Office Desk - Career, Government Work and Contracts Vastu', NULL, 650.00, 750.00, 'https://shop.astrowani.com/assets/vastu/wooden-ashoka-pillar-stambh-success-politics-political-career-contract.jpg', 'Vastu Enhancer', true, 56
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Wooden Ashoka Pillar Ashok Stambh for Office Desk - Career, Government Work and Contracts Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shriparni Sriparni Wooden Pyramid for Vastu Remedies', NULL, 300.00, 400.00, 'https://shop.astrowani.com/assets/vastu/shriparni-sriparni-wooden-pyramid.jpg', 'Pyramids', true, 57
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shriparni Sriparni Wooden Pyramid for Vastu Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Yellow Swastik Pyramid 2.5'''' Pair Vastu Remedies', NULL, 280.00, 480.00, 'https://shop.astrowani.com/assets/vastu/vastu-yellow-swastik-pyramid.jpg', 'Pyramids', true, 58
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Yellow Swastik Pyramid 2.5'''' Pair Vastu Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Wooden Pyramid Strip for Toilet Defects Or Division', NULL, 550.00, 650.00, 'https://shop.astrowani.com/assets/vastu/vastu-wooden-pyramid-strip-for-toilet-defects.jpg', 'Pyramids', true, 59
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Wooden Pyramid Strip for Toilet Defects Or Division');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Crystal Tortoise Turtle Feng Shui and Vastu Products for Home and Office Good Luck', NULL, 250.00, 300.00, 'https://shop.astrowani.com/assets/vastu/crystal-tortoise-turtle-feng-shui-vastu-products-home.jpg', 'Crystals', true, 60
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Crystal Tortoise Turtle Feng Shui and Vastu Products for Home and Office Good Luck');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Zinc Spiral Block for North-East Cut, Toilet, Bedroom, Kitchen Ishanya Vastu Dosh Nivaran', NULL, 500.00, 850.00, 'https://shop.astrowani.com/assets/vastu/zinc-spiral-block-north-east-vastu-dosh-nivaran.jpg', 'Pyramids', true, 61
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Zinc Spiral Block for North-East Cut, Toilet, Bedroom, Kitchen Ishanya Vastu Dosh Nivaran');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Spiral Block for North-West- Vastu Shastra Dosha Nivaran Remedies', NULL, 600.00, 750.00, 'https://shop.astrowani.com/assets/vastu/brass-spiral-block-for-north-west-vastu-shastra-remedies.jpg', 'Pyramids', true, 62
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Spiral Block for North-West- Vastu Shastra Dosha Nivaran Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Yellow Swarovski Crystal Ball Sun Catcher Vastu Feng Shui', NULL, 690.00, 890.00, 'https://shop.astrowani.com/assets/vastu/yellow-swarovski-crystal-ball.jpg', 'Crystals', true, 63
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Yellow Swarovski Crystal Ball Sun Catcher Vastu Feng Shui');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Panchdhatu Pyramid for Vastu - Five Metal Dosh Remedy for Positive Energy at Home, Office and Plot', NULL, 1750.00, 1699.00, 'https://shop.astrowani.com/assets/vastu/panchdhatu-pyramid-vastu-enhancer-vastu-remedy.jpg', 'Pyramids', true, 64
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Panchdhatu Pyramid for Vastu - Five Metal Dosh Remedy for Positive Energy at Home, Office and Plot');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Beautiful Handicraft Home Decor Brass Elephant Pair for Vastu and Fengshui Item for Home', NULL, 500.00, 650.00, 'https://shop.astrowani.com/assets/vastu/brass-elephant-statue-vastu-feng-shui.jpg', 'Feng Shui', true, 65
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Beautiful Handicraft Home Decor Brass Elephant Pair for Vastu and Fengshui Item for Home');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Sankat Mochan Mahabali Bahubali Hanuman Yantra - Powerful Vastu Remedy for South-Facing Door', NULL, 2750.00, 2950.00, 'https://shop.astrowani.com/assets/vastu/sankat-mochan-bahubali-hanuman-yantra.jpg', 'Vastu Enhancer', true, 66
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Sankat Mochan Mahabali Bahubali Hanuman Yantra - Powerful Vastu Remedy for South-Facing Door');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Peeli Kaudi Yellow Cowrie for Lakshmi Puja, Cash Box and Locker Money Vastu', NULL, 850.00, 1050.00, 'https://shop.astrowani.com/assets/vastu/lakshmi-yellow-kaudi-peeli-kowdi-cowrie.jpg', 'Vastu Enhancer', true, 67
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Peeli Kaudi Yellow Cowrie for Lakshmi Puja, Cash Box and Locker Money Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Brass Strip Pyramid Divider Virtual Partition Or Toilet at North-West', NULL, 550.00, 650.00, 'https://shop.astrowani.com/assets/vastu/vastu-brass-strip-pyramid-divider-virtual-partition.jpg', 'Pyramids', true, 68
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Brass Strip Pyramid Divider Virtual Partition Or Toilet at North-West');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Valampuri Right Hand Conch Shell Dakshinavarti Shankh', NULL, 1200.00, 1400.00, 'https://shop.astrowani.com/assets/vastu/valampuri-right-hand-conch-shell-dakshinavarti-shankh.jpg', NULL, true, 69
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Valampuri Right Hand Conch Shell Dakshinavarti Shankh');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Sphatik Crystal Shri Yantra - Natural Quartz Yantra for Wealth and Prosperity, Home and Office Temple', NULL, 999.00, 1299.00, 'https://shop.astrowani.com/assets/vastu/crystal-shri-yantra.jpg', 'Vastu Enhancer', true, 70
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Sphatik Crystal Shri Yantra - Natural Quartz Yantra for Wealth and Prosperity, Home and Office Temple');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Goddess Saraswati Idol Statue (Students Education and Studies)', NULL, 1300.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/goddess-saraswati-brass-idol-statue-murti.jpg', 'Vastu Enhancer', true, 71
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Goddess Saraswati Idol Statue (Students Education and Studies)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Pyramid Set 1 inch for Vastu - East and South-East Main Door Remedy, Home Office Temple', NULL, 1750.00, 1800.00, 'https://shop.astrowani.com/assets/vastu/copper-pyramid-set-1inch.jpg', 'Pyramids', true, 72
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Pyramid Set 1 inch for Vastu - East and South-East Main Door Remedy, Home Office Temple');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Master Crystal Grid - Sacred Geometry Vastu Tool for Wealth, Success and Harmony at Home and Office', NULL, 2750.00, 2950.00, 'https://shop.astrowani.com/assets/vastu/master-crystal-grid.jpg', 'Crystals', true, 73
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Master Crystal Grid - Sacred Geometry Vastu Tool for Wealth, Success and Harmony at Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'North East Bathroom Crystal Remedies Cure', NULL, 1200.00, 1400.00, 'https://shop.astrowani.com/assets/vastu/north-east-bathroom.jpg', 'Crystals', true, 74
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'North East Bathroom Crystal Remedies Cure');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Relationship Crystal Grid Bring Spark in Love and Relationship', NULL, 3000.00, 3200.00, 'https://shop.astrowani.com/assets/vastu/relashipship-crystal-grid.jpg', 'Crystals', true, 75
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Relationship Crystal Grid Bring Spark in Love and Relationship');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Teamwork Crystal Grid with Dalmatian Jasper for Office Harmony. Teamwork Crystal Grid - Boost Collaboration and Performance in Your Workspace', NULL, 1750.00, 1950.00, 'https://shop.astrowani.com/assets/vastu/team-work-crystal-grid.jpg', 'Crystals', true, 76
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Teamwork Crystal Grid with Dalmatian Jasper for Office Harmony. Teamwork Crystal Grid - Boost Collaboration and Performance in Your Workspace');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Energy balancer -Vastu Pyramid plate', NULL, 1650.00, 2250.00, 'https://shop.astrowani.com/assets/vastu/energy-balancer-vastu-pyramid-plate-silver.jpg', 'Pyramids', true, 77
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Energy balancer -Vastu Pyramid plate');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Pyramid Space Healing and Sleeping Plate', NULL, 1650.00, 2250.00, 'https://shop.astrowani.com/assets/vastu/sleeping-plate-space-healing-plate.jpg', 'Pyramids', true, 78
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Pyramid Space Healing and Sleeping Plate');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Earth Crystal Tray', NULL, 6250.00, 9500.00, 'https://shop.astrowani.com/assets/vastu/earth-crystal-tray-south-west-vastu.jpg', 'Crystals', true, 79
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Earth Crystal Tray');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Earth Potli (Premium)', NULL, 6250.00, 9500.00, 'https://shop.astrowani.com/assets/vastu/earth-potli-strong-crystals-for-southwest-zone-2.jpg', 'Crystals', true, 80
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Earth Potli (Premium)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shriparni Saraswati Yantra Sacred Geometry Wall Art for Students Knowledge and Wisdom', NULL, 999.00, 1250.00, 'https://shop.astrowani.com/assets/vastu/shriparni-saraswati-yantra.jpg', 'Gifts', true, 81
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shriparni Saraswati Yantra Sacred Geometry Wall Art for Students Knowledge and Wisdom');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Mangal Frame with eight auspicious symbols', NULL, 500.00, 700.00, 'https://shop.astrowani.com/assets/vastu/vastu-mangal-wooden-frame-auspiciouos-symbol.jpg', 'Vastu Enhancer', true, 82
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Mangal Frame with eight auspicious symbols');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Swastik Bell for Home and Office Main Door Entrance', NULL, 500.00, 1250.00, 'https://shop.astrowani.com/assets/vastu/vastu-swastik-bell-for-main-entrance.jpg', 'Feng Shui', true, 83
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Swastik Bell for Home and Office Main Door Entrance');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Mangal Kalasha - Marble Pot with Marble Nariyal - Ideal for Housewarming, Gifting, and Pooja Essentials', NULL, 2100.00, 2300.00, 'https://shop.astrowani.com/assets/vastu/vastu-mangal-kalasha-marble-pot.jpg', 'Handicraft', true, 84
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Mangal Kalasha - Marble Pot with Marble Nariyal - Ideal for Housewarming, Gifting, and Pooja Essentials');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Space-X Swastika [Cure Multiple Vastu Defect at Home, Office, Business]', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/space-x-swastika-vastu-correction-improvement.jpg', 'Pyramids', true, 85
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Space-X Swastika [Cure Multiple Vastu Defect at Home, Office, Business]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Dharmachakra Karma Chakra', NULL, 1550.00, 1750.00, 'https://shop.astrowani.com/assets/vastu/dharmachakra-for-peace-mindfulness-buddha.jpg', 'Vastu Enhancer', true, 86
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Dharmachakra Karma Chakra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Dhanvantari Brass Idol for Vastu - Wall Hanging for Health and Healing, Home and Clinic, 5.5 inch', NULL, 3750.00, 4250.00, 'https://shop.astrowani.com/assets/vastu/dhanvantari-lord-health-ayrvedic-medicine.jpg', 'Vastu Enhancer', true, 87
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Dhanvantari Brass Idol for Vastu - Wall Hanging for Health and Healing, Home and Clinic, 5.5 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Element Pyramid -Balance Vastu elements-wish manifestation', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/vastu-element-pyramid.jpg', 'Pyramids', true, 88
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Element Pyramid -Balance Vastu elements-wish manifestation');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lakshmi Ganesh Vastu Yantra [Framed]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/lakshmi-ganesh-yantra.jpg', NULL, true, 89
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lakshmi Ganesh Vastu Yantra [Framed]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Kailash Dhan Raksha Vastu Yantra [Framed]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/kailash-dhan-raksha-yantra.jpg', 'Vastu Enhancer', true, 90
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Kailash Dhan Raksha Vastu Yantra [Framed]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Asthalakshmi Shree Yantra for Vastu, Astrology [Framed]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/asthalakshmi-shree-yantra.jpg', 'Vastu Enhancer', true, 91
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Asthalakshmi Shree Yantra for Vastu, Astrology [Framed]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Original Shri Kuber Yantra for Pooja, Wealth, Prosperity, Vastu at Home and Office [Framed]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/kuber-poojan-yantra.jpg', NULL, true, 92
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Original Shri Kuber Yantra for Pooja, Wealth, Prosperity, Vastu at Home and Office [Framed]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Indrani Yantra for Vyapar Vriddhi and Vastu Dosh Removal [Framed]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/indrani-yantra-for-home-office.jpg', NULL, true, 93
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Indrani Yantra for Vyapar Vriddhi and Vastu Dosh Removal [Framed]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shree Yantra for home and office [Framed]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/shree-yantra-for-house-warming-spiritual-gift.jpg', 'Vastu Enhancer', true, 94
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shree Yantra for home and office [Framed]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'New Vastu Financial Crystal Grid - Money Luck', NULL, 2050.00, 2350.00, 'https://shop.astrowani.com/assets/vastu/new-vastu-financial-crystal-grid-money-luck.jpg', 'Crystals', true, 95
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'New Vastu Financial Crystal Grid - Money Luck');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Geopathic Stress Neutralizer Copper Rod For Vastu, Space Healing', NULL, 1100.00, 1900.00, 'https://shop.astrowani.com/assets/vastu/geopathic-stress-copper-rod.jpg', 'Pyramids', true, 96
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Geopathic Stress Neutralizer Copper Rod For Vastu, Space Healing');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Geopathic Stress Neutralizer Brass Rod - Vastu Tool for Space Healing and Negative Energy Correction', NULL, 1100.00, 2550.00, 'https://shop.astrowani.com/assets/vastu/geopathic-stress-brass-rod.jpg', 'Pyramids', true, 97
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Geopathic Stress Neutralizer Brass Rod - Vastu Tool for Space Healing and Negative Energy Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Eagle A Powerful Symbol of Vision, Courage, Protection and Rising Success', NULL, 1999.00, 2500.00, 'https://shop.astrowani.com/assets/vastu/brass-eagle-for-protection.jpg', 'Feng Shui', true, 98
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Eagle A Powerful Symbol of Vision, Courage, Protection and Rising Success');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Metal Limbu Mirchi Door Hanging Feng Shui Vastu Remedies for Protection from Negativity Home Office', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/metal-limbu-mirchi-door-hanging-for-protection.jpg', 'Feng Shui', true, 99
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Metal Limbu Mirchi Door Hanging Feng Shui Vastu Remedies for Protection from Negativity Home Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Sun for Vastu - Surya Dev Remedy for East Wall, Home and Office Decor, 7.5 inch', NULL, 5000.00, 6000.00, 'https://shop.astrowani.com/assets/vastu/copper-vastu-sun-7-5inch.jpg', 'Vastu Enhancer', true, 100
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Sun for Vastu - Surya Dev Remedy for East Wall, Home and Office Decor, 7.5 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Premium Brass Ganesha Tortoise Home and Office Vastu Decor - 1.420 Kg', NULL, 6300.00, 6500.00, 'https://shop.astrowani.com/assets/vastu/ganesha-tortoise-vastu-decor.jpg', 'Feng Shui', true, 101
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Premium Brass Ganesha Tortoise Home and Office Vastu Decor - 1.420 Kg');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Mandala Tibetan Buddhist Wall Hanging Plate with Ashtamangala - Vishva Vajra and Sacred Symbols - 15 Inches', NULL, 27500.00, 28000.00, 'https://shop.astrowani.com/assets/vastu/brass-mandala.jpg', 'Vastu Enhancer', true, 102
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Mandala Tibetan Buddhist Wall Hanging Plate with Ashtamangala - Vishva Vajra and Sacred Symbols - 15 Inches');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Astha Lakshmi Pot in Brass with Citrine Financial Stone - For Wealth, Prosperity, and Good Luck', NULL, 7000.00, 7500.00, 'https://shop.astrowani.com/assets/vastu/astha-lakshmi-pot-in-brass.jpg', 'Vastu Enhancer', true, 103
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Astha Lakshmi Pot in Brass with Citrine Financial Stone - For Wealth, Prosperity, and Good Luck');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Feng Shui Vastu Bell 9 Bell 9 Lucky Coins - Home and Office Main Door Entrance Decor', NULL, 900.00, 1200.00, 'https://shop.astrowani.com/assets/vastu/feng-shui-vastu-bell-9-bell-9-coins.jpg', 'Feng Shui', true, 104
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Feng Shui Vastu Bell 9 Bell 9 Lucky Coins - Home and Office Main Door Entrance Decor');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Beautiful Green Aventurine Tortoise 2" for business and money luck', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/beautiful-green-aventurine-tortoise.jpg', 'Crystals', true, 105
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Beautiful Green Aventurine Tortoise 2" for business and money luck');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Beautiful Rose Quartz Tortoise 3" For Shop and Showroom', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/beautiful-rose-quartz-tortoise.jpg', 'Crystals', true, 106
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Beautiful Rose Quartz Tortoise 3" For Shop and Showroom');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Beautiful Marble Tortoise 3" for Career and Job Opportunity', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/marble-tortoise.jpg', 'Vastu Enhancer', true, 107
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Beautiful Marble Tortoise 3" for Career and Job Opportunity');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Spiral Block for Dosh Nivaran Remedies Products Items for Home and Office', NULL, 600.00, 750.00, 'https://shop.astrowani.com/assets/vastu/copper-spiral-block-vastu-dosh-nivaran-remedies-home-office.jpg', 'Pyramids', true, 108
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Spiral Block for Dosh Nivaran Remedies Products Items for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Kalpavriksha Tree of Life for Vastu - Good Luck and Prosperity Decor for Home and Office', NULL, 3500.00, 3600.00, 'https://shop.astrowani.com/assets/vastu/brass-kalpavriksha-tree-of-life.jpg', 'Vastu Enhancer', true, 109
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Kalpavriksha Tree of Life for Vastu - Good Luck and Prosperity Decor for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Lord Indra Dev Statue Vastu Enhancer and Remedies Product', NULL, 3000.00, 3200.00, 'https://shop.astrowani.com/assets/vastu/brass-lord-indra-dev-premium-vastu-enhancer.jpg', 'Vastu Enhancer', true, 110
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Lord Indra Dev Statue Vastu Enhancer and Remedies Product');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Feng Shui Vastu Lucky 3 Bell 3 Good Luck Coins Vaastu Products for Home Office Main Door Entrance Hanging (Big Size)', NULL, 550.00, 700.00, 'https://shop.astrowani.com/assets/vastu/feng-shui-vastu-3-bell-3-coins-vaastu-fengshui-products-home-office.jpg', 'Feng Shui', true, 111
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Feng Shui Vastu Lucky 3 Bell 3 Good Luck Coins Vaastu Products for Home Office Main Door Entrance Hanging (Big Size)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Pyramid 2.5inch for North-West Home, Office, Plots Vastu Shastra Remedies Product', NULL, 1250.00, 1550.00, 'https://shop.astrowani.com/assets/vastu/brass-pyramid-2-5-vastu-shastra-remedies.jpg', 'Pyramids', true, 112
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Pyramid 2.5inch for North-West Home, Office, Plots Vastu Shastra Remedies Product');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Blessing Buddha Idol Statue', NULL, 1500.00, 1700.00, 'https://shop.astrowani.com/assets/vastu/brass-blessing-buddha-statue-idol.jpg', 'Vastu Enhancer', true, 113
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Blessing Buddha Idol Statue');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Ashoka Pillar Stambh - Vastu Symbol for Success in Politics and Career, 6 inch', NULL, 3150.00, 3350.00, 'https://shop.astrowani.com/assets/vastu/brass-ashoka-pillar-stambha-6inch.jpg', 'Vastu Enhancer', true, 114
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Ashoka Pillar Stambh - Vastu Symbol for Success in Politics and Career, 6 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Premium Brass Celestial Kamdhenu Cow 9 x 7.5" Vastu Product Home', NULL, 11000.00, 11500.00, 'https://shop.astrowani.com/assets/vastu/premium-brass-celestial-kamdhenu-cow-8-5-x-7inch.jpg', 'Vastu Enhancer', true, 115
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Premium Brass Celestial Kamdhenu Cow 9 x 7.5" Vastu Product Home');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Kamdhenu Cow with Calf Brass Idol - Vastu Remedy for Prosperity and Harmony, Home and Office', NULL, 3000.00, 3200.00, 'https://shop.astrowani.com/assets/vastu/celestial-kamdhenu-cow-calf-brass-3-5x4inch.jpg', 'Vastu Enhancer', true, 116
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Kamdhenu Cow with Calf Brass Idol - Vastu Remedy for Prosperity and Harmony, Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Meru Shriparni (sevan or saven ) Shri yantra- 3inch', NULL, 1450.00, 1950.00, 'https://shop.astrowani.com/assets/vastu/meru-sriparni-sevan-or-saven-shri-yantra-3inch.jpg', 'Vastu Enhancer', true, 117
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Meru Shriparni (sevan or saven ) Shri yantra- 3inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Feng Shui Brass Tortoise Kachua with Plate', NULL, 700.00, 850.00, 'https://shop.astrowani.com/assets/vastu/vastu-feng-shui-brass-tortoise-kachua-with-plate.jpg', 'Feng Shui', true, 118
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Feng Shui Brass Tortoise Kachua with Plate');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Tibetan Singing Bowl for Meditation - Sound Healing and Space Purification for Reiki and Yoga', NULL, 1200.00, 1500.00, 'https://shop.astrowani.com/assets/vastu/tibetan-singing-bowl-space-purification-reiki-sound-healing.jpg', 'Handicraft', true, 119
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Tibetan Singing Bowl for Meditation - Sound Healing and Space Purification for Reiki and Yoga');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Health Crystal Grid', NULL, 1250.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/health-crystal-grid.jpg', 'Crystals', true, 120
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Health Crystal Grid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Helix 6inch Vastu Dosh Remedies North-West Defect Nivaran 3pc', NULL, 3500.00, 5000.00, 'https://shop.astrowani.com/assets/vastu/brass-helix-6inch-vastu-dosh-remedies-north-west-3pc.jpg', 'Pyramids', true, 121
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Helix 6inch Vastu Dosh Remedies North-West Defect Nivaran 3pc');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Fire Element Vastu - Space Healing Grid - Heal Your Home and Office', NULL, 1250.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/fire-element-vastu-pyramid-grid.jpg', 'Crystals', true, 122
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Fire Element Vastu - Space Healing Grid - Heal Your Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shriparni Sriparni Wooden Pyramid 3inch with Base Pyramid Plate', NULL, 600.00, 800.00, 'https://shop.astrowani.com/assets/vastu/shriparni-sriparni-wooden-pyramid-3inch.jpg', 'Pyramids', true, 123
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shriparni Sriparni Wooden Pyramid 3inch with Base Pyramid Plate');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Natural Crystal Square Cubes For Energy Correction, Vastu Correction', NULL, 3800.00, 4000.00, 'https://shop.astrowani.com/assets/vastu/natural-crystal-square-cubes-for-energy.jpg', 'Crystals', true, 124
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Natural Crystal Square Cubes For Energy Correction, Vastu Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Premium Crystal Grid ( Model PVI-7306 )', NULL, 1950.00, 2150.00, 'https://shop.astrowani.com/assets/vastu/premium-crystal-grid-model-pvi-7306.jpg', 'Crystals', true, 125
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Premium Crystal Grid ( Model PVI-7306 )');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Financial Crystal Grid - Money Luck', NULL, 1850.00, 2150.00, 'https://shop.astrowani.com/assets/vastu/vastu-financial-crystal-grid.jpg', 'Crystals', true, 126
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Financial Crystal Grid - Money Luck');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Premium Crystal Grid ( Model PVI-7307 )', NULL, 2050.00, 2250.00, 'https://shop.astrowani.com/assets/vastu/personal-healing-vastu-crystal-grid.jpg', 'Crystals', true, 127
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Premium Crystal Grid ( Model PVI-7307 )');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Personal Healing Vastu Crystal Grid', NULL, 2550.00, 2600.00, 'https://shop.astrowani.com/assets/vastu/personal-healing-vastu-crystal-grid-2.jpg', 'Crystals', true, 128
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Personal Healing Vastu Crystal Grid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Brass Pyramid 1.75inch for Home and Office', NULL, 850.00, 900.00, 'https://shop.astrowani.com/assets/vastu/brass-vastu-pyramid-1-75inch.jpg', 'Pyramids', true, 129
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Brass Pyramid 1.75inch for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Orgone Geo Stress Copper Pyramid to Release Geopathic Stress', NULL, 2550.00, 2799.00, 'https://shop.astrowani.com/assets/vastu/geopathic-stress-copper-pyramid.jpg', 'Pyramids', true, 130
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Orgone Geo Stress Copper Pyramid to Release Geopathic Stress');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Panchmukhi Mahabali Hanuman for South Facing House Vastu', NULL, 550.00, 600.00, 'https://shop.astrowani.com/assets/vastu/brass-panchmukhi-mahabali-hanuman.jpg', 'Vastu Enhancer', true, 131
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Panchmukhi Mahabali Hanuman for South Facing House Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Silver Plated Pyramid Chips - Multiple Vastu Uses - Mirror Pyramid', NULL, 250.00, 270.00, 'https://shop.astrowani.com/assets/vastu/mirror-pyramid-silver-plated-chips.jpg', 'Pyramids', true, 132
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Silver Plated Pyramid Chips - Multiple Vastu Uses - Mirror Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Bhaum/Bhoum Yantra for South, South West Main Door Entrance Vastu Dosh Nivaran Remedies', NULL, 1600.00, 1750.00, 'https://shop.astrowani.com/assets/vastu/bhaum-yantra-bhoum-yantra-for-south-west-main-door-vastu-dosh.jpg', 'Vastu Enhancer', true, 133
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Bhaum/Bhoum Yantra for South, South West Main Door Entrance Vastu Dosh Nivaran Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Bejewelled Wish Fulfilling Feng Shui Wind Horse with Secret Wish Compartment Carrying Jewel Trinket Box', NULL, 2100.00, 2150.00, 'https://shop.astrowani.com/assets/vastu/feng-shui-wind-horse-carrying-jewel-trinket-box.jpg', 'Feng Shui', true, 134
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Bejewelled Wish Fulfilling Feng Shui Wind Horse with Secret Wish Compartment Carrying Jewel Trinket Box');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Meditation Pyramid Wall Hanging for Vastu - Positive Energy and Calm Mind for Home and Office', NULL, 6000.00, 9000.00, 'https://shop.astrowani.com/assets/vastu/copper-meditation-pyramid.jpg', 'Pyramids', true, 135
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Meditation Pyramid Wall Hanging for Vastu - Positive Energy and Calm Mind for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Red Jasper Pyramid A Fire Stone', NULL, 1150.00, 1200.00, 'https://shop.astrowani.com/assets/vastu/red-jasper-pyramid.jpg', 'Crystals', true, 136
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Red Jasper Pyramid A Fire Stone');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten PyraVastu Swastik Gold', NULL, 2000.00, 2050.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyravastu-swastik-gold.jpg', 'Pyramids', true, 137
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten PyraVastu Swastik Gold');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Harmony Pyramid', NULL, 1300.00, 1350.00, 'https://shop.astrowani.com/assets/vastu/jiten-harmony-pyramid.jpg', 'Pyramids', true, 138
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Harmony Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Marriage Pyramid To Attract Your Soul Mate', NULL, 1400.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/jiten-marriage-pyramid.jpg', 'Pyramids', true, 139
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Marriage Pyramid To Attract Your Soul Mate');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Wish Pyramid Advance', NULL, 1300.00, 1350.00, 'https://shop.astrowani.com/assets/vastu/jiten-wish-pyramid-advance.jpg', 'Pyramids', true, 140
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Wish Pyramid Advance');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Reiki Pyramid Reiki Energy Product', NULL, 1280.00, 1350.00, 'https://shop.astrowani.com/assets/vastu/jiten-reiki-pyramid.jpg', 'Pyramids', true, 141
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Reiki Pyramid Reiki Energy Product');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Natural Yellow Aventurine Ball Sphere with Crystal Stand', NULL, 1900.00, 1950.00, 'https://shop.astrowani.com/assets/vastu/natural-yellow-aventurine-ball-sphere.jpg', 'Crystals', true, 142
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Natural Yellow Aventurine Ball Sphere with Crystal Stand');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Medicine 9x 9 ( Medicine Charging )', NULL, 800.00, 850.00, 'https://shop.astrowani.com/assets/vastu/medicine-9x9-medicine-charging.jpg', 'Pyramids', true, 143
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Medicine 9x 9 ( Medicine Charging )');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Asthakon Octagonal Copper Pyramid Brahmasthan Center Home House Plot Bungalow', NULL, 1900.00, 2500.00, 'https://shop.astrowani.com/assets/vastu/asthakon-octagonal-copper-pyramid-brahmasthan-center-home-house.jpg', 'Pyramids', true, 144
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Asthakon Octagonal Copper Pyramid Brahmasthan Center Home House Plot Bungalow');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shani Tarka or Shani Tadi - Vastu Remedy', NULL, 1450.00, 1500.00, 'https://shop.astrowani.com/assets/vastu/shani-tarka-or-shani-tadi-vastu-remedy.jpg', 'Vastu Enhancer', true, 145
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shani Tarka or Shani Tadi - Vastu Remedy');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Yantra for Wealth, Prosperity, House Warming and Spiritual Gifting [Size 3 x 3 Inches, Multi Colour]', NULL, 950.00, 1100.00, 'https://shop.astrowani.com/assets/vastu/shri-yantra-vastu-sri-shree-spiritual-gift.jpg', 'Vastu Enhancer', true, 146
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Yantra for Wealth, Prosperity, House Warming and Spiritual Gifting [Size 3 x 3 Inches, Multi Colour]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Copper Pyramid Chip Gold Plated (Golden)', NULL, 250.00, 350.00, 'https://shop.astrowani.com/assets/vastu/vastu-copper-pyramid-chip-gold-plated.jpg', 'Pyramids', true, 147
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Copper Pyramid Chip Gold Plated (Golden)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lord Kubera Idol Brass Wealth God - 3inch', NULL, 700.00, 850.00, 'https://shop.astrowani.com/assets/vastu/brass-lord-kubera-god-of-wealth.jpg', 'Vastu Enhancer', true, 148
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lord Kubera Idol Brass Wealth God - 3inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lord Kuber Brass Statue - Hindu God of Wealth and Prosperity - Ideal for Home, Office, Tijori, and Locker (Size 5 x 3 inches)', NULL, 3050.00, 3100.00, 'https://shop.astrowani.com/assets/vastu/lord-kubera-god-of-wealth-size-5-x-3-inches.jpg', 'Vastu Enhancer', true, 149
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lord Kuber Brass Statue - Hindu God of Wealth and Prosperity - Ideal for Home, Office, Tijori, and Locker (Size 5 x 3 inches)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Natural Crystal Sphatik Kumbh Kalash Vastu Product Home and Office', NULL, 850.00, 900.00, 'https://shop.astrowani.com/assets/vastu/natural-crystal-sphatik-kumbh-kalash-vastu.jpg', NULL, true, 150
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Natural Crystal Sphatik Kumbh Kalash Vastu Product Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Crystal Shell (Shankha)', NULL, 850.00, NULL, 'https://shop.astrowani.com/assets/vastu/crystal-shell-shankha.jpg', NULL, true, 151
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Crystal Shell (Shankha)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lead Spiral Block Swastika Vastu Remedies for South-West Dosha', NULL, 500.00, 750.00, 'https://shop.astrowani.com/assets/vastu/lead-spiral-block-vastu-remedies-south-west-dosha.jpg', 'Pyramids', true, 152
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lead Spiral Block Swastika Vastu Remedies for South-West Dosha');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Auspicious Vastu Lakshmi Charan Paduka Steps Pagla for Main Door Entrance at Home and Office', NULL, 550.00, NULL, 'https://shop.astrowani.com/assets/vastu/vastu-lakshmi-charan-paduka-pagla.jpg', 'Vastu Enhancer', true, 153
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Auspicious Vastu Lakshmi Charan Paduka Steps Pagla for Main Door Entrance at Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Wooden Pyramid Symbol [2 Inches] (Set of 3 Pyramids)', NULL, 450.00, 500.00, 'https://shop.astrowani.com/assets/vastu/wooden-pyramid-symbol-2-inches.jpg', 'Pyramids', true, 154
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Wooden Pyramid Symbol [2 Inches] (Set of 3 Pyramids)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lord Kubera (Jambhala) God of Wealth', NULL, 1700.00, NULL, 'https://shop.astrowani.com/assets/vastu/lord-kubera-jambhala-god-of-wealth.jpg', 'Vastu Enhancer', true, 155
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lord Kubera (Jambhala) God of Wealth');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Natural Citrine Raw Rock Stone Chunks', NULL, 1200.00, 1350.00, 'https://shop.astrowani.com/assets/vastu/gratitude-rock-financial-stone-citrine.jpg', 'Crystals', true, 156
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Natural Citrine Raw Rock Stone Chunks');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Pyramid Chip for Vastu - Single Layer Remedy for Home and Office, 2 inch', NULL, 500.00, 600.00, 'https://shop.astrowani.com/assets/vastu/copper-pyramid-chip-2inch.jpg', 'Pyramids', true, 157
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Pyramid Chip for Vastu - Single Layer Remedy for Home and Office, 2 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Corner Angle Pyramid Set for Vastu - Multiple Dosh Correction for Home, Office and Plot, 4pcs', NULL, 1800.00, 1850.00, 'https://shop.astrowani.com/assets/vastu/corner-angle-copper-pyramid-4pcs.jpg', 'Pyramids', true, 158
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Corner Angle Pyramid Set for Vastu - Multiple Dosh Correction for Home, Office and Plot, 4pcs');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Vastu Pyramid Chips 9pcs Vastu Dosh Nivaran Without Demolition', NULL, 1000.00, 1250.00, 'https://shop.astrowani.com/assets/vastu/copper-vastu-pyramid-chips-1inch-9pcs.jpg', 'Pyramids', true, 159
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Vastu Pyramid Chips 9pcs Vastu Dosh Nivaran Without Demolition');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Vastu Nandi Bull - Mahavastu Remedy for Business Protection and Harmony', NULL, 1500.00, 1750.00, 'https://shop.astrowani.com/assets/vastu/brass-vastu-nandi-bull-mahavastu-remedies.jpg', 'Vastu Enhancer', true, 160
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Vastu Nandi Bull - Mahavastu Remedy for Business Protection and Harmony');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Lead Helix 6inch Southwest Extension, Corner Cut Vastu Dosha (3pcs)', NULL, 2950.00, 5000.00, 'https://shop.astrowani.com/assets/vastu/vastu-lead-helix-6inch-3pcs-southwest.jpg', 'Pyramids', true, 161
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Lead Helix 6inch Southwest Extension, Corner Cut Vastu Dosha (3pcs)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Space Harmoniser Pyramid with Vastu Purush for Brahmasthan and Vastu Defects', NULL, 8999.00, 9999.00, 'https://shop.astrowani.com/assets/vastu/vastu-space-harmoniser-pyramid-with-vastu-purush.jpg', 'Pyramids', true, 162
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Space Harmoniser Pyramid with Vastu Purush for Brahmasthan and Vastu Defects');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Relationship Pyramid - Natural Pink Rose Quartz Pyramid 2inch', NULL, 850.00, 1050.00, 'https://shop.astrowani.com/assets/vastu/natural-pink-rose-quartz-pyramid.jpg', 'Crystals', true, 163
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Relationship Pyramid - Natural Pink Rose Quartz Pyramid 2inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Sampurna Ridhi Sidhi Yantra (wooden laminated)', NULL, 599.00, 1250.00, 'https://shop.astrowani.com/assets/vastu/shri-sampurna-ridhi-sidhi-yantra-wooden-laminated.jpg', 'Vastu Enhancer', true, 164
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Sampurna Ridhi Sidhi Yantra (wooden laminated)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Brass Water Urli Bird Bath Pot for North East Dosha Defects', NULL, 4500.00, 4700.00, 'https://shop.astrowani.com/assets/vastu/vastu-water-brass-urli-for-north-east-dosha-defects.jpg', 'Vastu Enhancer', true, 165
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Brass Water Urli Bird Bath Pot for North East Dosha Defects');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Kalpavriksha Tree of Life With Square Stand Vastu Remedies Product for Home and Office', NULL, 3200.00, 3400.00, 'https://shop.astrowani.com/assets/vastu/kalpavriksha-tree-of-life-square-stand-vastu.jpg', 'Vastu Enhancer', true, 166
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Kalpavriksha Tree of Life With Square Stand Vastu Remedies Product for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Wooden Elephant Carved Statue for Vastu, Feng Shui, Home Decor', NULL, 1450.00, 1500.00, 'https://shop.astrowani.com/assets/vastu/wooden-elephant-vastu-feng-shui-statue.jpg', 'Vastu Enhancer', true, 167
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Wooden Elephant Carved Statue for Vastu, Feng Shui, Home Decor');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Vastu Sun Surya Statue for Home and Office Wall Hanging and Decor Interiors and Vastu Remedy', NULL, 9000.00, 9050.00, 'https://shop.astrowani.com/assets/vastu/brass-vastu-sun-surya.jpg', 'Vastu Enhancer', true, 168
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Vastu Sun Surya Statue for Home and Office Wall Hanging and Decor Interiors and Vastu Remedy');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'White Blowing Conch Shell Lakshmi Shankh (4-5 inches, White)', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/white-blowing-shankh.jpg', NULL, true, 169
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'White Blowing Conch Shell Lakshmi Shankh (4-5 inches, White)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lead Pyramid 2.5 inch, South-West Missing Corner/Cut Vastu Remedy', NULL, 1200.00, 1250.00, 'https://shop.astrowani.com/assets/vastu/vastu-lead-pyramid-missing-corner-or-cut-in-south-west-dosha-remedies.jpg', 'Pyramids', true, 170
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lead Pyramid 2.5 inch, South-West Missing Corner/Cut Vastu Remedy');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Car Pyramid Yantra for Protection - Car Accident and Mishaps', NULL, 450.00, 500.00, 'https://shop.astrowani.com/assets/vastu/vastu-car-pyramid-yantra-for-protection.jpg', 'Pyramids', true, 171
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Car Pyramid Yantra for Protection - Car Accident and Mishaps');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Vastu Dosh Nivaran Pyramid Yantra for Home and Office Temple to keep in North-East [Health, Wealth and Prosperity]', NULL, 1101.00, 1550.00, 'https://shop.astrowani.com/assets/vastu/copper-vastu-dosh-nivaran-pyramid-yantra.jpg', 'Pyramids', true, 172
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Vastu Dosh Nivaran Pyramid Yantra for Home and Office Temple to keep in North-East [Health, Wealth and Prosperity]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'New Premium Celestial Kamdhenu Cow Brass - 6 x 5 Inches Vastu Enhancer and Remedies Product', NULL, 6000.00, 6050.00, 'https://shop.astrowani.com/assets/vastu/brass-brahmand-kamdhenu-cow-6-x-5-vastu.jpg', 'Vastu Enhancer', true, 173
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'New Premium Celestial Kamdhenu Cow Brass - 6 x 5 Inches Vastu Enhancer and Remedies Product');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Asthamangal Home Office Main Door Entrance With Eight Auspicious Symbols Sriparni (Wooden)', NULL, 900.00, 950.00, 'https://shop.astrowani.com/assets/vastu/vastu-jain-asthamangala-auspicious-symbols.jpg', 'Vastu Enhancer', true, 174
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Asthamangal Home Office Main Door Entrance With Eight Auspicious Symbols Sriparni (Wooden)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Compass with 6 Charts - 8, 16 and 32 Zone Direction Reading Tool for Home and Plot', NULL, 600.00, 750.00, 'https://shop.astrowani.com/assets/vastu/vastu-compass-with-6-charts.jpg', 'Vastu Enhancer', true, 175
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Compass with 6 Charts - 8, 16 and 32 Zone Direction Reading Tool for Home and Plot');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Earth Globe - Bring the World''s Energy into Your Home', NULL, 1350.00, 1699.00, 'https://shop.astrowani.com/assets/vastu/earth-globe.jpg', NULL, true, 176
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Earth Globe - Bring the World''s Energy into Your Home');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jumbo Copper Pyramid for Vastu - Large Pyramid for Land, Plot, Construction and Big Properties', NULL, 5400.00, 7500.00, 'https://shop.astrowani.com/assets/vastu/jumbo-copper-pyramid.jpg', 'Pyramids', true, 177
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jumbo Copper Pyramid for Vastu - Large Pyramid for Land, Plot, Construction and Big Properties');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Panchmukhi Hanuman Brass Idol for Main Door - South and South-West Facing Vastu Protection, 4 inch', NULL, 1400.00, 1699.00, 'https://shop.astrowani.com/assets/vastu/brass-panchmukhi-hanuman-wall-hanging.jpg', 'Vastu Enhancer', true, 178
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Panchmukhi Hanuman Brass Idol for Main Door - South and South-West Facing Vastu Protection, 4 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Vastu Dosh Nashak Yantra - All-Round Vastu Defect Remedy for Home, Office and Shop, 3 inch', NULL, 500.00, 699.00, 'https://shop.astrowani.com/assets/vastu/pure-copper-vastu-dosh-nashak-yantra.jpg', 'Vastu Enhancer', true, 179
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Vastu Dosh Nashak Yantra - All-Round Vastu Defect Remedy for Home, Office and Shop, 3 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shree Lakshmi Kuber Yantra For Pooja, Wealth and Prosperity, Vastu at Home and Office Size 3Inch', NULL, 470.00, 599.00, 'https://shop.astrowani.com/assets/vastu/shree-lakshmi-kuber-yantra.jpg', NULL, true, 180
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shree Lakshmi Kuber Yantra For Pooja, Wealth and Prosperity, Vastu at Home and Office Size 3Inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vahan Durghatna Nashak Yantra Copper - Vehicle Accident Protection Yantra for Car and Bike, 3 inch', NULL, 499.00, 699.00, 'https://shop.astrowani.com/assets/vastu/copper-vahan-durghatna-nashak-yantra.jpg', 'Vastu Enhancer', true, 181
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vahan Durghatna Nashak Yantra Copper - Vehicle Accident Protection Yantra for Car and Bike, 3 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Swastik for Vastu - Auspicious Good Luck Symbol for Home and Office, 3 inch', NULL, 600.00, 899.00, 'https://shop.astrowani.com/assets/vastu/brass-swastik-size-3-vastu-remedies.jpg', 'Vastu Enhancer', true, 182
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Swastik for Vastu - Auspicious Good Luck Symbol for Home and Office, 3 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Lakshmi Charan Paduka (Pair 3 Inch Each)', NULL, 1400.00, 2000.00, 'https://shop.astrowani.com/assets/vastu/brass-lakshmi-charan-paduka-pair-3-inch.jpg', 'Vastu Enhancer', true, 183
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Lakshmi Charan Paduka (Pair 3 Inch Each)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Panchmukhi Hanuman Yantra Copper for South, South-West Facing Main Door Entrance [Size 3 x 3 Inches]', NULL, 475.00, 600.00, 'https://shop.astrowani.com/assets/vastu/panchmukhi-hanuman-yantra.jpg', 'Vastu Enhancer', true, 184
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Panchmukhi Hanuman Yantra Copper for South, South-West Facing Main Door Entrance [Size 3 x 3 Inches]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Baglamukhi Yantra Power and Dominance Over Your Enemies', NULL, 550.00, 650.00, 'https://shop.astrowani.com/assets/vastu/baglamukhi-yantra.jpg', NULL, true, 185
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Baglamukhi Yantra Power and Dominance Over Your Enemies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Yantra Wooden Shriparni - Wealth and Prosperity Vastu Yantra for Home, Office and Pooja', NULL, 950.00, 1200.00, 'https://shop.astrowani.com/assets/vastu/wooden-shriparni-sriparni-savan-shri-yantra.jpg', 'Vastu Enhancer', true, 186
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Yantra Wooden Shriparni - Wealth and Prosperity Vastu Yantra for Home, Office and Pooja');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Saraswati Vastu Yantra Students Educations, Studies, Classes [Size 3 x 3 Inches, Multi Colour]', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/saraswati-vastu-yantra-multi-colour.jpg', 'Gifts', true, 187
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Saraswati Vastu Yantra Students Educations, Studies, Classes [Size 3 x 3 Inches, Multi Colour]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brihaspati Vastu Yantra (Jupiter Yantra) [ Size 3 x 3 Inches, Multi Colour ]', NULL, 550.00, 650.00, 'https://shop.astrowani.com/assets/vastu/brihaspati-vastu-yantra.jpg', NULL, true, 188
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brihaspati Vastu Yantra (Jupiter Yantra) [ Size 3 x 3 Inches, Multi Colour ]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Dakshin Mukhaya Yantra For South Facing House, Office Vastu', NULL, 500.00, 600.00, 'https://shop.astrowani.com/assets/vastu/dakshin-mukhaya-yantra.jpg', 'Vastu Enhancer', true, 189
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Dakshin Mukhaya Yantra For South Facing House, Office Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Property Sale Yantra (Home, Office, Residential, Commercial Properties)', NULL, 500.00, 600.00, 'https://shop.astrowani.com/assets/vastu/property-sale-yantra.jpg', 'Vastu Enhancer', true, 190
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Property Sale Yantra (Home, Office, Residential, Commercial Properties)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Sarva Karya Siddhi Yantra [Size 3 x 3 Inches, Multi Colour]', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/sarva-karya-siddhi-yantra.jpg', 'Vastu Enhancer', true, 191
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Sarva Karya Siddhi Yantra [Size 3 x 3 Inches, Multi Colour]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Mahamrityunjaya Vastu Yantra [ Size 3 x 3 Inches, Multi Colour ]', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shri-mahamrityunjaya-vastu-yantra.jpg', NULL, true, 192
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Mahamrityunjaya Vastu Yantra [ Size 3 x 3 Inches, Multi Colour ]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lensatic Magnetic Compass', NULL, 500.00, 650.00, 'https://shop.astrowani.com/assets/vastu/lensatic-magnetic-compass.jpg', 'Vastu Enhancer', true, 193
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lensatic Magnetic Compass');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lensatic Prismatic Vastu Compass for Directions', NULL, 1150.00, 1200.00, 'https://shop.astrowani.com/assets/vastu/lensatic-prismatic-vastu-compass.jpg', 'Vastu Enhancer', true, 194
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lensatic Prismatic Vastu Compass for Directions');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyramid Chip 2inch (1pc)', NULL, 460.00, 500.00, 'https://shop.astrowani.com/assets/vastu/jiten-fortune-pyramid-chip.jpg', 'Pyramids', true, 195
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyramid Chip 2inch (1pc)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Sukh Samriddhi Vastu Yantra [Size 3 x 3 Inches, Copper]', NULL, 500.00, 650.00, 'https://shop.astrowani.com/assets/vastu/sukh-samriddhi-vastu-yantra.jpg', 'Vastu Enhancer', true, 196
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Sukh Samriddhi Vastu Yantra [Size 3 x 3 Inches, Copper]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Education Pyramid for Students Education, Memory, Concentration, Studies and Academic Success', NULL, 2000.00, 2050.00, 'https://shop.astrowani.com/assets/vastu/jiten-education-pyramid.jpg', 'Pyramids', true, 197
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Education Pyramid for Students Education, Memory, Concentration, Studies and Academic Success');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Kuber Yantra For Pooja, Wealth and Prosperity, Vastu at Home and Office [Box Size 4 x 4 Inches]', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/kuber-yantra-wealth-vastu.jpg', NULL, true, 198
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Kuber Yantra For Pooja, Wealth and Prosperity, Vastu at Home and Office [Box Size 4 x 4 Inches]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Purush Mahayantram With Navagraha Multi Colour', NULL, 1200.00, 1500.00, 'https://shop.astrowani.com/assets/vastu/vastu-purush-mahayantram-with-navagraha.jpg', 'Vastu Enhancer', true, 199
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Purush Mahayantram With Navagraha Multi Colour');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shree Durga Dwar Vastu Yantra for Health, Wealth and Protection [Size 3 x 3 Inches, Copper]', NULL, 500.00, 600.00, 'https://shop.astrowani.com/assets/vastu/shree-durga-dwar-vastu-yantra.jpg', NULL, true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shree Durga Dwar Vastu Yantra for Health, Wealth and Protection [Size 3 x 3 Inches, Copper]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Meru Shri Yantra Gold Plated - 3D Vastu Yantra for Wealth and Prosperity, Home and Office Pooja, CNC Cut', NULL, 1999.00, 2500.00, 'https://shop.astrowani.com/assets/vastu/premium-shri-yantra-gold-plated.jpg', 'Vastu Enhancer', true, 201
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Meru Shri Yantra Gold Plated - 3D Vastu Yantra for Wealth and Prosperity, Home and Office Pooja, CNC Cut');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Venus - Luxury Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-venus-luxury-pyramid.jpg', 'Pyramids', true, 202
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Venus - Luxury Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Mars - Courage Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-mars-courage-pyramid.jpg', 'Pyramids', true, 203
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Mars - Courage Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Ketu - Prosperity Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-ketu-prosperity-pyramid.jpg', 'Pyramids', true, 204
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Ketu - Prosperity Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Wish Pyramid', NULL, 4780.00, 4800.00, 'https://shop.astrowani.com/assets/vastu/jiten-fortune-wish-pyramid.jpg', 'Pyramids', true, 205
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Wish Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Swastik 700 - Gold Pyramid - Pyra Vastu Remedies', NULL, 9400.00, 9450.00, 'https://shop.astrowani.com/assets/vastu/jiten-swastik-700-gold.jpg', 'Pyramids', true, 206
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Swastik 700 - Gold Pyramid - Pyra Vastu Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Mercury - Business Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-mercury-business-pyramid.jpg', 'Pyramids', true, 207
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Mercury - Business Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Jupiter - Spirituality Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-jupiter-spirituality-pyramid.jpg', 'Pyramids', true, 208
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Jupiter - Spirituality Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Sun - Vitality Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-sun-vitality-pyramid.jpg', 'Pyramids', true, 209
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Sun - Vitality Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Red Fame Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-red-fame-pyramid.jpg', 'Pyramids', true, 210
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Red Fame Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Green Family Relationship Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-green-family-relationship.jpg', 'Pyramids', true, 211
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Green Family Relationship Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Pink - Love Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-pink-love-pyramid.jpg', 'Pyramids', true, 212
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Pink - Love Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Yellow - Health Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-yellow-health.jpg', 'Pyramids', true, 213
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Yellow - Health Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Brown Education Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-brown-education-pyramid.jpg', 'Pyramids', true, 214
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Brown Education Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Ketu - Prosperity', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-ketu-prosperity.jpg', 'Pyramids', true, 215
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Ketu - Prosperity');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Blue - Career Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-blue-career-pyramid.jpg', 'Pyramids', true, 216
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Blue - Career Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Yellow - Health', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-yellow-health.jpg', 'Pyramids', true, 217
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Yellow - Health');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Sun - Vitality', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-sun-vitality.jpg', 'Pyramids', true, 218
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Sun - Vitality');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Live Green Wealth Pyramid', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-live-green-wealth.jpg', 'Pyramids', true, 219
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Live Green Wealth Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Mercury - Business', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-mercury-business.jpg', 'Pyramids', true, 220
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Mercury - Business');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Live-Green-Wealth', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-live-green-wealth.jpg', 'Pyramids', true, 221
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Live-Green-Wealth');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Brown - Education', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-brown-education.jpg', 'Pyramids', true, 222
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Brown - Education');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gray Children Pyramid For Vastu', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gray-children.jpg', 'Pyramids', true, 223
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gray Children Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Jupiter - Spiritual', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-jupiter-spiritual.jpg', 'Pyramids', true, 224
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Jupiter - Spiritual');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Pink - Love Vastu Correction Yantra', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-pink-love.jpg', 'Pyramids', true, 225
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Pink - Love Vastu Correction Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Moon - Calm Mind', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-moon-calm-mind.jpg', 'Pyramids', true, 226
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Moon - Calm Mind');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Blue - Career', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-blue-career.jpg', 'Pyramids', true, 227
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Blue - Career');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Success', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-success-online-in-india.jpg', 'Pyramids', true, 228
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Success');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Metallic - Helpful Friends', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-metallic-helpful-friends.jpg', 'Pyramids', true, 229
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Metallic - Helpful Friends');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Rahu - Status', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-rahu-status.jpg', 'Pyramids', true, 230
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Rahu - Status');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Gray - Children', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-gray-children.jpg', 'Pyramids', true, 231
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Gray - Children');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Saturn - Happiness', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-saturn-happiness.jpg', 'Pyramids', true, 232
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Saturn - Happiness');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Mars - Courage Pyramid Vastu Correction Tool', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-mars-courage.jpg', 'Pyramids', true, 233
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Mars - Courage Pyramid Vastu Correction Tool');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Red - Fame', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-red-fame.jpg', 'Pyramids', true, 234
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Red - Fame');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Pyron - Feng Shui Kit (set of 9)', NULL, 6760.00, 6800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyramid-pyron-feng-shui-kit-set-of-9.jpg', 'Pyramids', true, 235
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Pyron - Feng Shui Kit (set of 9)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier Plus (multier with booster plate) Vastu Tool Pyramid', NULL, 500.00, 550.00, 'https://shop.astrowani.com/assets/vastu/jiten-multier-plus-booster-plate.jpg', 'Pyramids', true, 236
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier Plus (multier with booster plate) Vastu Tool Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Venus - Luxury', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-venus-luxury.jpg', 'Pyramids', true, 237
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Venus - Luxury');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Mini-Max Pyramid - Vastu Correction', NULL, 1500.00, 1550.00, 'https://shop.astrowani.com/assets/vastu/jiten-mini-max-pyramid-vastu-correction.jpg', 'Pyramids', true, 238
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Mini-Max Pyramid - Vastu Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Progress', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyron-gold-progress-online-in-india.jpg', 'Pyramids', true, 239
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Progress');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Table Max (Copper) Pyramid', NULL, 2650.00, 2700.00, 'https://shop.astrowani.com/assets/vastu/jiten-table-max-copper.jpg', 'Pyramids', true, 240
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Table Max (Copper) Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Table Max (Gold) Pyramid', NULL, 4300.00, 4350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-table-max-gold-pyramid.jpg', 'Pyramids', true, 241
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Table Max (Gold) Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Vastu Kit Pyramid', NULL, 6960.00, 7000.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-vastu-kit.jpg', 'Pyramids', true, 242
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Vastu Kit Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten FMG ( Flat Max Gold ) Pyramid', NULL, 24700.00, 24750.00, 'https://shop.astrowani.com/assets/vastu/jiten-fmg-flat-max-gold.jpg', 'Pyramids', true, 243
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten FMG ( Flat Max Gold ) Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron Gold Fortune', NULL, 8300.00, 8350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-gold-fortune.jpg', 'Pyramids', true, 244
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron Gold Fortune');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Reiki - Smart Fire Pyramid', NULL, 7500.00, 7550.00, 'https://shop.astrowani.com/assets/vastu/jiten-reiki-smart-fire-pyramid.jpg', 'Pyramids', true, 245
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Reiki - Smart Fire Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyron 9G Pyramid', NULL, 1300.00, 1350.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyron-9g-pyramid.jpg', 'Pyramids', true, 246
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyron 9G Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Ashta Ganesh Disc Yantra', NULL, 3000.00, 3050.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-ashta-ganesh-disc-yantra.jpg', 'Pyramids', true, 247
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Ashta Ganesh Disc Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten PyraVastu Swastik Copper Pyramid For Home and Office', NULL, 1900.00, 1950.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyravastu-swastik-copper-pyramid.jpg', 'Pyramids', true, 248
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten PyraVastu Swastik Copper Pyramid For Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Reiki Card- Set Pyramid', NULL, 1400.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-reiki-card-set-pyramid.jpg', 'Pyramids', true, 249
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Reiki Card- Set Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Fortune Door ( Gold Edition )', NULL, 15000.00, 15050.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyramid-fortune-door-gold-edition.jpg', 'Pyramids', true, 250
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Fortune Door ( Gold Edition )');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten ProMax (3G) Gold Pyramid', NULL, 70800.00, 70850.00, 'https://shop.astrowani.com/assets/vastu/jiten-promax-3g-gold-pyramid.jpg', 'Pyramids', true, 251
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten ProMax (3G) Gold Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Max Booster Plate ( for Max and Super- Max Pyramid )', NULL, 1080.00, 1100.00, 'https://shop.astrowani.com/assets/vastu/jiten-max-booster-plate.jpg', 'Pyramids', true, 252
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Max Booster Plate ( for Max and Super- Max Pyramid )');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Reiki Pyramid - Advance', NULL, 4850.00, 4900.00, 'https://shop.astrowani.com/assets/vastu/jiten-reiki-pyramid-advance.jpg', 'Pyramids', true, 253
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Reiki Pyramid - Advance');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Flat Max Copper', NULL, 4500.00, 4550.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyramid-flat-max-copper.jpg', 'Pyramids', true, 254
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Flat Max Copper');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Shift Max Pyramids', NULL, 4400.00, 4450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-shift-max-pyramid.jpg', 'Pyramids', true, 255
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Shift Max Pyramids');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Reiki Disc Pyramid', NULL, 2900.00, 2950.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-reiki-disc-pyramid-online-in-india.jpg', 'Pyramids', true, 256
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Reiki Disc Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Gold Cross For Divine Blessings', NULL, 5450.00, 5500.00, 'https://shop.astrowani.com/assets/vastu/jiten-gold-cross.jpg', 'Pyramids', true, 257
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Gold Cross For Divine Blessings');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Max 500 For Vastu Correction', NULL, 9750.00, 9800.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyramid-max-500.jpg', 'Pyramids', true, 258
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Max 500 For Vastu Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Yantron ProMax (5G) - Master Key To Enhanced Peace, Prosperity and Happiness', NULL, 120000.00, 120100.00, 'https://shop.astrowani.com/assets/vastu/jiten-yantron-promax-5g.jpg', 'Pyramids', true, 259
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Yantron ProMax (5G) - Master Key To Enhanced Peace, Prosperity and Happiness');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Reiki Pyramid - Master', NULL, 21400.00, 21450.00, 'https://shop.astrowani.com/assets/vastu/jiten-reiki-pyramid-master.jpg', 'Pyramids', true, 260
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Reiki Pyramid - Master');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Gold Trishul', NULL, 5450.00, 5500.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyramid-gold-trishul-online-in-india.jpg', 'Pyramids', true, 261
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Gold Trishul');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Max - Basic Pyramid', NULL, 2000.00, 2050.00, 'https://shop.astrowani.com/assets/vastu/jiten-max-basic-pyramid.jpg', 'Pyramids', true, 262
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Max - Basic Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Door Pyramid', NULL, 5800.00, 5850.00, 'https://shop.astrowani.com/assets/vastu/jiten-fortune-door-pyramid.jpg', 'Pyramids', true, 263
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Door Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Mystic Eye 9x9 Pyramid', NULL, 2850.00, 2900.00, 'https://shop.astrowani.com/assets/vastu/jiten-mystic-eye-9x9.jpg', 'Pyramids', true, 264
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Mystic Eye 9x9 Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Aum 9x9 Pyramid', NULL, 2800.00, 2850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-aum-9x9-pyramid-online-in-india.jpg', 'Pyramids', true, 265
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Aum 9x9 Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Vastu Pyramid Multier 9x9 Original Multi Layer Pyramid Set', NULL, 250.00, 300.00, 'https://shop.astrowani.com/assets/vastu/buy-vastu-pyramid-multier-9x9-original-jiten.jpg', 'Pyramids', true, 266
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Vastu Pyramid Multier 9x9 Original Multi Layer Pyramid Set');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten NuMax Pyramid', NULL, 3130.00, 3200.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-numax-pyramid-online-in-india.jpg', 'Pyramids', true, 267
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten NuMax Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Study Seat Pyramid', NULL, 2300.00, 2350.00, 'https://shop.astrowani.com/assets/vastu/jiten-study-seat-pyramid.jpg', 'Pyramids', true, 268
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Study Seat Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Staircase 9x9 ( Set of 3 for Staircase Defects Pyramid )', NULL, 950.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/jiten-staircase-9x9-set-of-3.jpg', 'Pyramids', true, 269
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Staircase 9x9 ( Set of 3 for Staircase Defects Pyramid )');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier International Pyramid', NULL, 400.00, 450.00, 'https://shop.astrowani.com/assets/vastu/jiten-multier-international-pyramid.jpg', 'Pyramids', true, 270
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier International Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Luck 9x9', NULL, 2800.00, 2850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyramid-luck-9x9-online-in-india.jpg', 'Pyramids', true, 271
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Luck 9x9');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Flat Max', NULL, 6800.00, 6900.00, 'https://shop.astrowani.com/assets/vastu/jiten-flat-max-pyramid.jpg', 'Pyramids', true, 272
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Flat Max');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Glass', NULL, 860.00, 900.00, 'https://shop.astrowani.com/assets/vastu/jiten-fortune-glass.jpg', 'Pyramids', true, 273
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Glass');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Booster 9x9 Vastu Pyramid', NULL, 300.00, 350.00, 'https://shop.astrowani.com/assets/vastu/jiten-booster-9x9-vastu-pyramid.jpg', 'Pyramids', true, 274
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Booster 9x9 Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid International Max for Vastu Pyramid', NULL, 4500.00, 4550.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyramid-international-max.jpg', 'Pyramids', true, 275
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid International Max for Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Gold Aum', NULL, 7400.00, 7450.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyramid-gold-aum.jpg', 'Pyramids', true, 276
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Gold Aum');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Astha Ganesh Plate Pyramid', NULL, 800.00, 850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-astha-ganesh-plate-pyramid-online-in-india.jpg', 'Pyramids', true, 277
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Astha Ganesh Plate Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten PyraCap Mind Power Pyramid', NULL, 350.00, 400.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyracap-mind-power-pyramid.jpg', 'Pyramids', true, 278
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten PyraCap Mind Power Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten My 1st Experiment Pyramid', NULL, 600.00, 650.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-my-1st-experiment-pyramid-online-in-india.jpg', 'Pyramids', true, 279
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten My 1st Experiment Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Angle Pyramid - Vastu Remedy', NULL, 1425.00, 1475.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-angle-pyramid-vastu-remedy-online-in-india.jpg', 'Pyramids', true, 280
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Angle Pyramid - Vastu Remedy');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Super Max - Vastu Correction', NULL, 6820.00, 6900.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyramid-super-max.jpg', 'Pyramids', true, 281
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Super Max - Vastu Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Faatron Pyramid', NULL, 850.00, 900.00, 'https://shop.astrowani.com/assets/vastu/jiten-faatron-pyra-vastu-pyramid.jpg', 'Pyramids', true, 282
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Faatron Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Activator Pyramid', NULL, 1725.00, 1800.00, 'https://shop.astrowani.com/assets/vastu/jiten-fortune-activator.jpg', 'Pyramids', true, 283
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Activator Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Business Disc', NULL, 2900.00, 2950.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyramid-business-disc.jpg', 'Pyramids', true, 284
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Business Disc');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Promax Special Pyramid', NULL, 24800.00, 24900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-promax-special-pyramid.jpg', 'Pyramids', true, 285
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Promax Special Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Promax (2G) Pyramid', NULL, 38500.00, 38550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-promax-2g-pyramid.jpg', 'Pyramids', true, 286
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Promax (2G) Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Strip Pyramid - Vastu Remedies', NULL, 800.00, 900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-strip-pyramid-vastu-remedies-online-in-india.jpg', 'Pyramids', true, 287
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Strip Pyramid - Vastu Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Band Pyramid - Feng Shui and Vastu Correction', NULL, 1400.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-band-pyramid-feng-shui-and-vastu-correction.jpg', 'Pyramids', true, 288
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Band Pyramid - Feng Shui and Vastu Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Reiki Seat Pyramid', NULL, 2250.00, 2300.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-reiki-seat-pyramid-online-in-india.jpg', 'Pyramids', true, 289
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Reiki Seat Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Airon Agarbatti Stand with Pyramid Power', NULL, 800.00, 850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-airon-agarbatti-stand-with-pyramid-power-online-in-india.jpg', 'Pyramids', true, 290
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Airon Agarbatti Stand with Pyramid Power');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Maatron Stress Removal Pyramid', NULL, 850.00, 900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-maatron-stress-removal-pyramid-online-in-india.jpg', 'Pyramids', true, 291
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Maatron Stress Removal Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Cleanzon - Vastu Products', NULL, 860.00, 900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-cleanzon-vastu-products-online-in-india.jpg', 'Pyramids', true, 292
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Cleanzon - Vastu Products');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Vastu Natron Pyramid For Bathroom and Toilet Vastu Corrections', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/jiten-vastu-natron-for-bathroom-toilet-pyramid.jpg', 'Pyramids', true, 293
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Vastu Natron Pyramid For Bathroom and Toilet Vastu Corrections');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Vastu Energy 9x9 Pyramid for House, Shop and Office', NULL, 850.00, 900.00, 'https://shop.astrowani.com/assets/vastu/jiten-vastu-energy-9x9-pyramid-house-shop.jpg', 'Pyramids', true, 294
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Vastu Energy 9x9 Pyramid for House, Shop and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Vastu Sleep Pyramid', NULL, 4080.00, 4200.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-vastu-sleep-pyramid-online-in-india.jpg', 'Pyramids', true, 295
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Vastu Sleep Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Shift Max Slim (SMS)', NULL, 4900.00, 5550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-shift-max-slim-sms-online-in-india.jpg', 'Pyramids', true, 296
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Shift Max Slim (SMS)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Arrow Pyramid Vastu Yantra', NULL, 915.00, 975.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-arrow-pyramid-vastu-yantra-online-in-india.jpg', 'Pyramids', true, 297
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Arrow Pyramid Vastu Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Mega Shubh Labh', NULL, 1860.00, 1900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyramid-mega-shubh-labh.jpg', 'Pyramids', true, 298
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Mega Shubh Labh');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Keychain For Lockers, Cars, Bike, House And Shops', NULL, 500.00, 550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-keychain-lockers-cars-bike.jpg', 'Pyramids', true, 299
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Keychain For Lockers, Cars, Bike, House And Shops');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Yantron Pyramid Yantra', NULL, 34600.00, 34650.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-yantron-pyramid-yantra.jpg', 'Pyramids', true, 300
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Yantron Pyramid Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Vastu Swastik Mini', NULL, 250.00, 300.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-vastu-swastik-mini.jpg', 'Pyramids', true, 301
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Vastu Swastik Mini');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Seat Pyramid', NULL, 2500.00, 2600.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-seat-pyramid-online-in-india.jpg', 'Pyramids', true, 302
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Seat Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier Advance (Fast Results, Easy Installation Pyramid)', NULL, 800.00, 850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-multier-advance-fast-results.jpg', 'Pyramids', true, 303
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier Advance (Fast Results, Easy Installation Pyramid)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Protect 9x9 for Inside Pyramid', NULL, 500.00, 550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-protect-9x9-for-inside-pyramid.jpg', 'Pyramids', true, 304
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Protect 9x9 for Inside Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Fire Pyramid', NULL, 5580.00, 5750.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-fire-pyramid-online-in-india.jpg', 'Pyramids', true, 305
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Fire Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Centron Plate', NULL, 1500.00, 1550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-centron-plate-online-in-india.jpg', 'Pyramids', true, 306
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Centron Plate');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Clock Gold', NULL, 13500.00, 13550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-clock-gold-online-in-india.jpg', 'Pyramids', true, 307
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Clock Gold');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten FaMa Pendulum', NULL, 1400.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fama-pendulum-online-in-india.jpg', 'Pyramids', true, 308
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten FaMa Pendulum');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Education Gold Pyramid For Students Education, Studies, Good Results, Enhanced Memory and Concentration', NULL, 10050.00, 10100.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-education-gold-pyramid-online-in-india.jpg', 'Pyramids', true, 309
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Education Gold Pyramid For Students Education, Studies, Good Results, Enhanced Memory and Concentration');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Study Head Band Pyramid', NULL, 500.00, 550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-study-head-band-pyramid.jpg', 'Pyramids', true, 310
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Study Head Band Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyramid Promax - Original', NULL, 20000.00, 20500.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyramid-promax-original.jpg', 'Pyramids', true, 311
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyramid Promax - Original');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Energy 9x9 - Shree Ganesh ( ganesh energy in the center ) Pyramid', NULL, 1000.00, 1050.00, 'https://shop.astrowani.com/assets/vastu/jiten-energy-9x9-shree-ganesh-ganesh-energy.jpg', 'Pyramids', true, 312
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Energy 9x9 - Shree Ganesh ( ganesh energy in the center ) Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Protect 9x9 - Outside Pyramid', NULL, 500.00, 550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-protect-9x9-outside-pyramid.jpg', 'Pyramids', true, 313
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Protect 9x9 - Outside Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card for Legal and Court Case - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-legal-court-case.jpg', 'Pyramids', true, 314
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card for Legal and Court Case - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card for Peace and Relaxation - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-peace-relaxation.jpg', 'Pyramids', true, 315
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card for Peace and Relaxation - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Plate Pyramid', NULL, 600.00, 700.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-plate-pyramid-online-in-india.jpg', 'Pyramids', true, 316
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Plate Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card for Energy and Vitality - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-for-energy-vitality.jpg', 'Pyramids', true, 317
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card for Energy and Vitality - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Study Meditation Cap Pyramid', NULL, 550.00, 600.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-study-cap-pyramid-online-in-india.jpg', 'Pyramids', true, 318
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Study Meditation Cap Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Protect - Super Pack (Inside/ Outside)', NULL, 1275.00, 1350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-protect-super-pack-inside-outside.jpg', 'Pyramids', true, 319
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Protect - Super Pack (Inside/ Outside)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card For Success and Progress - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-success-progress.jpg', 'Pyramids', true, 320
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card For Success and Progress - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Pillow Pyramid', NULL, 2460.00, 2500.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-pillow-pyramid-online-in-india.jpg', 'Pyramids', true, 321
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Pillow Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Study Eye Band Pyramid', NULL, 500.00, 550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-study-eye-band-pyramid-online-in-india.jpg', 'Pyramids', true, 322
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Study Eye Band Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card for Fame and Power - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-for-fame-power.jpg', 'Pyramids', true, 323
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card for Fame and Power - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Study Pad Pyramid for Student Education', NULL, 1200.00, 1250.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-study-pad-pyramid-student-education.jpg', 'Pyramids', true, 324
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Study Pad Pyramid for Student Education');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card Job and Promotion - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-job-and-promotion.jpg', 'Pyramids', true, 325
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card Job and Promotion - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card for Positivity and Happiness - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-positivity-happiness.jpg', 'Pyramids', true, 326
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card for Positivity and Happiness - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card For Luck and fortune - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-for-luck-fortune.jpg', 'Pyramids', true, 327
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card For Luck and fortune - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card For Family and Children - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-for-family-children.jpg', 'Pyramids', true, 328
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card For Family and Children - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card For Foreing and Higher Study - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-for-foreing-higher-study.jpg', 'Pyramids', true, 329
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card For Foreing and Higher Study - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Health 9x9 - Violet Pyramid', NULL, 750.00, 850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-health-9x9-violet-pyramid.jpg', 'Pyramids', true, 330
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Health 9x9 - Violet Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card For Marriage and Love - Pyra Vastu Expert Remedies', NULL, 750.00, 850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-for-marriage-love.jpg', 'Pyramids', true, 331
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card For Marriage and Love - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Card - Money and Finance Pyramid - Pyra Vastu Expert Remedies', NULL, 750.00, 850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-card-money-finance-pyramid-pyra.jpg', 'Pyramids', true, 332
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Card - Money and Finance Pyramid - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card For Memory and Concentration - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-for-memory-concentration.jpg', 'Pyramids', true, 333
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card For Memory and Concentration - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card For Strength and Confidence - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-strength-confidence.jpg', 'Pyramids', true, 334
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card For Strength and Confidence - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card For Protection and Safe-Guard - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-protection-safe-guard.png', 'Pyramids', true, 335
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card For Protection and Safe-Guard - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Health 9x9 Orange Pyramid', NULL, 700.00, 750.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-health-9x9-orange-pyramid-online-in-india.jpg', 'Pyramids', true, 336
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Health 9x9 Orange Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Health 9×9 Pyramid (Set of 7 Colors)', NULL, 1950.00, 2150.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-health-9x9-set-of-7-pyramid.jpg', 'Pyramids', true, 337
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Health 9×9 Pyramid (Set of 7 Colors)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Health 9x9 Green Pyramid', NULL, 700.00, 750.00, 'https://shop.astrowani.com/assets/vastu/jiten-health-9x9-green.jpg', 'Pyramids', true, 338
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Health 9x9 Green Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Bike 9x9 Pyramid', NULL, 400.00, 600.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-bike-9x9-pyramid-online-in-india.jpg', 'Pyramids', true, 339
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Bike 9x9 Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Pyra Card for Business and Career - Pyra Vastu Expert Remedies', NULL, 750.00, 800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-pyra-card-for-business-career.jpg', 'Pyramids', true, 340
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Pyra Card for Business and Career - Pyra Vastu Expert Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Mobile 9x9 Pyramid', NULL, 500.00, 700.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-mobile-9x9-pyramid-online-in-india.jpg', 'Pyramids', true, 341
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Mobile 9x9 Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Health 9x9 Red Pyramid', NULL, 700.00, 750.00, 'https://shop.astrowani.com/assets/vastu/jiten-health-9x9-red-pyramid.jpg', 'Pyramids', true, 342
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Health 9x9 Red Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Bemor 9x9 ( Vastu Yantra for Main Door )', NULL, 350.00, 550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-bemor-9x9-vastu-yantra-for-main-door.jpg', 'Pyramids', true, 343
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Bemor 9x9 ( Vastu Yantra for Main Door )');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Health 9x9 - Yellow Pyramid', NULL, 700.00, 900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-health-9x9-yellow-pyramid-online-in-india.jpg', 'Pyramids', true, 344
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Health 9x9 - Yellow Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Health 9x9 Blue Pyramid', NULL, 700.00, 900.00, 'https://shop.astrowani.com/assets/vastu/jiten-health-9x9-blue-pyramid.jpg', 'Pyramids', true, 345
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Health 9x9 Blue Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Disc Pyramid', NULL, 5350.00, 5850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-disc-pyramid-online-in-india.jpg', 'Pyramids', true, 346
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Disc Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Sphatik Crystal Shri Yantra with Wooden Shriparni Plate - Natural Quartz Vastu Yantra for Wealth and Pooja', NULL, 1600.00, 2500.00, 'https://shop.astrowani.com/assets/vastu/crystal-shri-yantra-with-wooden-sriparni-shri-yantra-plate.jpg', 'Crystals', true, 347
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Sphatik Crystal Shri Yantra with Wooden Shriparni Plate - Natural Quartz Vastu Yantra for Wealth and Pooja');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Peace and Meditation Seat Unique Pyramid Seat for Meditation and Pooja', NULL, 5700.00, 5900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-peace-and-meditation-seat-unique.jpg', 'Pyramids', true, 348
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Peace and Meditation Seat Unique Pyramid Seat for Meditation and Pooja');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Study Disc', NULL, 2940.00, 3150.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-study-disc-online-in-india.jpg', 'Pyramids', true, 349
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Study Disc');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Compass Pocket Folding Compass to Check Accurate Directions', NULL, 300.00, 500.00, 'https://shop.astrowani.com/assets/vastu/vastu-compass-pocket-folding-compass.jpg', 'Vastu Enhancer', true, 350
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Compass Pocket Folding Compass to Check Accurate Directions');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Sarva Manovanchit Karya Siddhi Vastu Yantra [Size 3 x 3 Inches, Multi Colour]', NULL, 550.00, 675.00, 'https://shop.astrowani.com/assets/vastu/shri-sarva-manovanchit-karya-siddhi-vastu-yantra.jpg', 'Vastu Enhancer', true, 351
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Sarva Manovanchit Karya Siddhi Vastu Yantra [Size 3 x 3 Inches, Multi Colour]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Earth Vastu Cubes-Yellow Citrine Quartz Size 0.5 Inches', NULL, 3900.00, 4000.00, 'https://shop.astrowani.com/assets/vastu/earth-vastu-cubes-yellow-citrine-quartz.jpg', 'Crystals', true, 352
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Earth Vastu Cubes-Yellow Citrine Quartz Size 0.5 Inches');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Siddhachakra Mahayantram - Jain Yantram', NULL, 1350.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/shri-siddhachakra-mahayantram-jain-yantram.jpg', NULL, true, 353
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Siddhachakra Mahayantram - Jain Yantram');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Swastik Mini - Copper Pair Pyramid For Vastu', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-swastik-mini-copper-pair-pyramid-for-vastu-online-in-india.jpg', 'Pyramids', true, 354
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Swastik Mini - Copper Pair Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Property Sale Yantra for Unsold Property with Wish Pyramid Box [Good for Real Estate Brokers]', NULL, 1250.00, 1500.00, 'https://shop.astrowani.com/assets/vastu/property-sale-yantra-for-unsold-property-with-wish-pyramid-box.jpg', 'Pyramids', true, 355
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Property Sale Yantra for Unsold Property with Wish Pyramid Box [Good for Real Estate Brokers]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Divine Locket Vastu', NULL, 4300.00, 4500.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-divine-locket-vastu-online-in-india.jpg', 'Pyramids', true, 356
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Divine Locket Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Special Max Pyramid For Vastu', NULL, 3270.00, 3350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-special-max-pyramid-for-vastu.jpg', 'Pyramids', true, 357
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Special Max Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Glass Gold Vastu', NULL, 2350.00, 3450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-glass-gold-vastu-online-in-india.jpg', 'Pyramids', true, 358
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Glass Gold Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Clock Copper Vastu', NULL, 5500.00, 5600.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-clock-copper-vastu-online-in-india.jpg', 'Pyramids', true, 359
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Clock Copper Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Cash Max ( Cash Box ) For Vastu', NULL, 5200.00, 5300.00, 'https://shop.astrowani.com/assets/vastu/jiten-cash-max-vastu-pyramid.jpg', 'Pyramids', true, 360
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Cash Max ( Cash Box ) For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Kalpavriksha Tree of Life Vastu Remedies Product for Home and Office', NULL, 7050.00, 7250.00, 'https://shop.astrowani.com/assets/vastu/kalpavriksha-tree-of-life-vastu-remedies-product.jpg', 'Vastu Enhancer', true, 361
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Kalpavriksha Tree of Life Vastu Remedies Product for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Max For Vastu Pyramid', NULL, 2800.00, 2850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-max-for-vastu-pyramid.jpg', 'Pyramids', true, 362
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Max For Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Eco Turbo Multier Pyramid Vastu', NULL, 400.00, 450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-eco-turbo-multier-pyramid-vastu-online-in-india.jpg', 'Pyramids', true, 363
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Eco Turbo Multier Pyramid Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Fire Gold Pyramid', NULL, 17000.00, 17100.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-fire-gold-pyramid-online-in-india.jpg', 'Pyramids', true, 364
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Fire Gold Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Fire Copper Pyramid', NULL, 7770.00, 7800.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-fire-copper-pyramid-online-in-india.jpg', 'Pyramids', true, 365
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Fire Copper Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Shubh Labh For Vastu Pyramid', NULL, 600.00, 650.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyra-shubh-labh.jpg', 'Pyramids', true, 366
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Shubh Labh For Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier - Gold Pyramid Vastu', NULL, 5850.00, 5950.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-multier-gold-pyramid-vastu.jpg', 'Pyramids', true, 367
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier - Gold Pyramid Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Door Pro Kit Pyramid For Vastu', NULL, 8800.00, 8900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-door-pro-kit-pyramid-for-vastu.jpg', 'Pyramids', true, 368
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Door Pro Kit Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Band Copper Pyramid For Vastu Products', NULL, 2600.00, 2650.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-band-copper-pyramid-for-vastu-products-online-in-india.jpg', 'Pyramids', true, 369
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Band Copper Pyramid For Vastu Products');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten ProMax 4G For Vastu Pyramid', NULL, 93000.00, 93050.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-promax-4g-for-vastu-pyramid-online-in-india.jpg', 'Pyramids', true, 370
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten ProMax 4G For Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier Automatic Pyramid For Vastu', NULL, 400.00, 450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-multier-automatic-pyramid-for-vastu-online-in-india.jpg', 'Pyramids', true, 371
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier Automatic Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Band Pyramid Gold For Vastu Correction', NULL, 5800.00, 5850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-band-pyramid-gold-for-vastu-correction-online-in-india.jpg', 'Pyramids', true, 372
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Band Pyramid Gold For Vastu Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Max 900 Pyramid For Vastu', NULL, 15950.00, 16000.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-max-900-pyramid-for-vastu-online-in-india.jpg', 'Pyramids', true, 373
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Max 900 Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Flat Max 3G Pyramid For Vastu', NULL, 68000.00, 68050.00, 'https://shop.astrowani.com/assets/vastu/jiten-flat-max-3g-pyramid.jpg', 'Pyramids', true, 374
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Flat Max 3G Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Energy 9x9 Copper For Vastu', NULL, 6250.00, 6350.00, 'https://shop.astrowani.com/assets/vastu/jiten-energy-9x9-copper.jpg', 'Pyramids', true, 375
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Energy 9x9 Copper For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Shift Max Gold Pyramids For Vastu Products', NULL, 7600.00, 7650.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-shift-max-gold-pyramids-for-vastu-products-online-in-india.jpg', 'Pyramids', true, 376
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Shift Max Gold Pyramids For Vastu Products');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Reiki Card Set', NULL, 1400.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-reiki-card-set-online-in-india.jpg', 'Pyramids', true, 377
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Reiki Card Set');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Protect Eco Inside and Outside Pyramid For Vastu', NULL, 800.00, 850.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-protect-eco-inside-outside-pyramid.jpg', 'Pyramids', true, 378
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Protect Eco Inside and Outside Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Matterss Vastu Accessories', NULL, 14450.00, 14500.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-pyra-matterss-vastu-accessories-online-in-india.jpg', 'Pyramids', true, 379
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Matterss Vastu Accessories');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Protect Car Baseline Pyramid', NULL, 850.00, 900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-protect-car-baseline-pyramid-online-in-india.jpg', 'Pyramids', true, 380
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Protect Car Baseline Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier Eco For Vastu Pyramid', NULL, 400.00, 450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-multier-eco-for-vastu-pyramid-online-in-india.jpg', 'Pyramids', true, 381
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier Eco For Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Tower Pyramid', NULL, 3450.00, 3500.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-tower-pyramid-online-in-india.jpg', 'Pyramids', true, 382
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Tower Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Meditation Cap Advance Vastu Pyramid', NULL, 2900.00, 2950.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-meditation-cap-advance-vastu-pyramid-online-in-india.jpg', 'Pyramids', true, 383
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Meditation Cap Advance Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier Special (FaMa) Pyramid', NULL, 1400.00, 1450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-multier-special-fama-pyramid.jpg', 'Pyramids', true, 384
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier Special (FaMa) Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Pyra Compass for Vastu and Pyra - Vastu', NULL, 800.00, 900.00, 'https://shop.astrowani.com/assets/vastu/jiten-pyra-compass.jpg', 'Pyramids', true, 385
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Pyra Compass for Vastu and Pyra - Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten NavGrah disc Pyramid For Vastu', NULL, 2850.00, 2900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-navgrah-disc-pyramid-for-vastu-online-in-india.jpg', 'Pyramids', true, 386
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten NavGrah disc Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier Ultra For Vastu', NULL, 400.00, 450.00, 'https://shop.astrowani.com/assets/vastu/jiten-multier-ultra-for-vastu.jpg', 'Pyramids', true, 387
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier Ultra For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Meditation Cap - Paper - Vastu Pyramid', NULL, 350.00, 450.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-meditation-cap-paper-vastu-pyramid.jpg', 'Pyramids', true, 388
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Meditation Cap - Paper - Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Master 9000 Vastu Pyramid', NULL, 16850.00, 16900.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-master-9000-vastu-pyramid-online-in-india.jpg', 'Pyramids', true, 389
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Master 9000 Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Energy 9x9 Gold For Vastu', NULL, 16000.00, 16200.00, 'https://shop.astrowani.com/assets/vastu/jiten-energy-9x9-gold.jpg', 'Pyramids', true, 390
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Energy 9x9 Gold For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Max Ultra Pyramid For Vastu', NULL, 2450.00, 2500.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-max-ultra-pyramid-for-vastu.jpg', 'Pyramids', true, 391
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Max Ultra Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Multier Copper Pyramid For Vastu', NULL, 2550.00, 2600.00, 'https://shop.astrowani.com/assets/vastu/jiten-multier-copper-pyramid-for-vastu.jpg', 'Pyramids', true, 392
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Multier Copper Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Master 5000 - Vastu Pyramid', NULL, 4250.00, 4300.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-master-5000-vastu-pyramid-online-in-india.jpg', 'Pyramids', true, 393
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Master 5000 - Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Bemor 9x9 (Energy and Luck Enhancer) For Vastu Pyramid', NULL, 350.00, 400.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-bemor-9x9energy-and-luck-enhancer-for-vastu-pyramid-online-i.jpg', 'Pyramids', true, 394
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Bemor 9x9 (Energy and Luck Enhancer) For Vastu Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten ProMax Copper Pyramid For Vastu', NULL, 14500.00, 14550.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-promax-copper-pyramid-for-vastu.jpg', 'Pyramids', true, 395
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten ProMax Copper Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Fortune Multier For Vastu Correction', NULL, 1100.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-fortune-multier-for-vastu-correction-online-in-india.jpg', 'Pyramids', true, 396
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Fortune Multier For Vastu Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Jiten Max Original Pyramid For Vastu', NULL, 2300.00, 2350.00, 'https://shop.astrowani.com/assets/vastu/buy-jiten-max-original-pyramid-for-vastu.jpg', 'Pyramids', true, 397
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Jiten Max Original Pyramid For Vastu');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Natural Crystal Square Cubes for Vastu Energy Correction', NULL, 550.00, 650.00, 'https://shop.astrowani.com/assets/vastu/natural-crystal-square-cubes-for-energy-2.jpg', 'Crystals', true, 398
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Natural Crystal Square Cubes for Vastu Energy Correction');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Mahamrityunjaya Yantra - Canvas print', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/shri-mahamrityunjaya-yantra.jpg', NULL, true, 399
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Mahamrityunjaya Yantra - Canvas print');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Dosh Nivaran Yantra [Size 3 x 3 Inches, Multi Colour]', NULL, 550.00, 800.00, 'https://shop.astrowani.com/assets/vastu/vastu-dosh-nivaran-yantra.jpg', 'Vastu Enhancer', true, 400
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Dosh Nivaran Yantra [Size 3 x 3 Inches, Multi Colour]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Annapurna Yantra for Home Kitchen [Framed]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/annapurna-yantra.jpg', NULL, true, 401
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Annapurna Yantra for Home Kitchen [Framed]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'New Home Vastu Kit for Gifting, GrihaPravesh', NULL, 6950.00, 7150.00, 'https://shop.astrowani.com/assets/vastu/new-home-vastu-kit.jpg', 'Vastu Enhancer', true, 402
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'New Home Vastu Kit for Gifting, GrihaPravesh');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Premium Vastu Kit', NULL, 15350.00, 15550.00, 'https://shop.astrowani.com/assets/vastu/premium-vastu-kit.gif', 'Vastu Enhancer', true, 403
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Premium Vastu Kit');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Deluxe Vastu Kit', NULL, 3070.00, 3200.00, 'https://shop.astrowani.com/assets/vastu/deluxe-vastu-kit-plusvalue-highly-recommended.png', 'Vastu Enhancer', true, 404
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Deluxe Vastu Kit');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shubham Pyramid - Pocket Card- Buy 5 card@500/-only', NULL, 1000.00, 1200.00, 'https://shop.astrowani.com/assets/vastu/shubham-pyramid-pocket-card.jpg', 'Pyramids', true, 405
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shubham Pyramid - Pocket Card- Buy 5 card@500/-only');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Premium Shri Mahamrityunjaya Yantra Home and Office Temple - Gold Plated with Accurate CNC Cutting for Vastu (1.5 Inches)', NULL, 1999.00, 2499.00, 'https://shop.astrowani.com/assets/vastu/premium-shri-mahamrityunjay-yantra-1-5inch.jpg', NULL, true, 406
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Premium Shri Mahamrityunjaya Yantra Home and Office Temple - Gold Plated with Accurate CNC Cutting for Vastu (1.5 Inches)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Premium Shri Kuber Yantra for Wealth and Prosperity, Gold Plated, 1.5 inch', NULL, 1999.00, 2499.00, 'https://shop.astrowani.com/assets/vastu/premium-shri-kuber-yantra-1-5-inches.jpg', NULL, true, 407
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Premium Shri Kuber Yantra for Wealth and Prosperity, Gold Plated, 1.5 inch');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Sri Swastika Extended Version of Swastik for Vastu-Vasudha Reiki symbol', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/sri-swastika-extended-modified-vastu-swastik.jpg', 'Feng Shui', true, 408
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Sri Swastika Extended Version of Swastik for Vastu-Vasudha Reiki symbol');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Baglamukhi Yantra Gold Plated - Vastu Yantra for Victory and Protection from Enemies, CNC Cut', NULL, 1999.00, 2999.00, 'https://shop.astrowani.com/assets/vastu/premium-baglamukhi-yantra-1-5-inches-gold-plated.jpg', NULL, true, 409
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Baglamukhi Yantra Gold Plated - Vastu Yantra for Victory and Protection from Enemies, CNC Cut');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Siddh Shani Dev Yantra Vastu Spiritual Gifting', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shri-shani-dev-yantra.jpg', NULL, true, 410
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Siddh Shani Dev Yantra Vastu Spiritual Gifting');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Santan Gopal Yantra [Blessing for Childless Couples]', NULL, 750.00, 950.00, 'https://shop.astrowani.com/assets/vastu/santan-gopal-yantra.jpg', NULL, true, 411
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Santan Gopal Yantra [Blessing for Childless Couples]');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Vyapar Vriddhi Yantra Spiritual Gifting', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/vastu-vyapar-vriddhi-yantra.jpg', 'Vastu Enhancer', true, 412
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Vyapar Vriddhi Yantra Spiritual Gifting');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Varun Dev Yantra Vastu Spiritual Gifting', NULL, 1400.00, 1600.00, 'https://shop.astrowani.com/assets/vastu/shri-varun-dev-yantra-copper.jpg', NULL, true, 413
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Varun Dev Yantra Vastu Spiritual Gifting');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Siddh Guru Dev Yantra', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shri-siddh-guru-dev-yantra.jpg', NULL, true, 414
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Siddh Guru Dev Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Shubh Lakshmi Yantra Vastu Spiritual Gifting', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shri-shubh-lakshmi-yantra.jpg', NULL, true, 415
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Shubh Lakshmi Yantra Vastu Spiritual Gifting');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Siddh Chandra Dev Yantra', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shri-siddhi-chandra-dev-yantra.jpg', NULL, true, 416
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Siddh Chandra Dev Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Sukh Samriddhi Yantra -Attractive Box-for Harmony in Family -Gifting', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/sukh-samriddhi-yantra-multi-colour.jpg', 'Vastu Enhancer', true, 417
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Sukh Samriddhi Yantra -Attractive Box-for Harmony in Family -Gifting');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shri Siddh Budh Dev Yantra Vastu Spiritual Gifting', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shri-siddh-budh-dev-yantra.jpg', NULL, true, 418
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shri Siddh Budh Dev Yantra Vastu Spiritual Gifting');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Earth Potli (Mini)', NULL, 2250.00, 2950.00, 'https://shop.astrowani.com/assets/vastu/mini-earth-potli-strong-crystals-for-southwest.jpg', 'Vastu Enhancer', true, 419
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Earth Potli (Mini)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Wealth Bowl Premium', NULL, 2500.00, 2750.00, 'https://shop.astrowani.com/assets/vastu/wealth-bowl-with-crystal-coins-rudraksha.jpg', 'Vastu Enhancer', true, 420
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Wealth Bowl Premium');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Property Buying and Bhoomi Dosh Nashak Yantra with Wish Pyramid Box', NULL, 1250.00, 1500.00, 'https://shop.astrowani.com/assets/vastu/property-buying-yantra-bhoomi-dosh-nashak.jpg', 'Pyramids', true, 421
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Property Buying and Bhoomi Dosh Nashak Yantra with Wish Pyramid Box');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Wealth Bowl Deluxe', NULL, 1800.00, 1950.00, 'https://shop.astrowani.com/assets/vastu/plus-value-vastu-wealth-bowl-deluxe.jpg', 'Vastu Enhancer', true, 422
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Wealth Bowl Deluxe');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Power Card- Pre-energized Pocket Charm Card', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/power-card-pre-energized-pocket-charm-card.jpg', 'Feng Shui', true, 423
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Power Card- Pre-energized Pocket Charm Card');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Wooden Sriparni Shriparni Savan Shri Kuber Yantra', NULL, 950.00, 1100.00, 'https://shop.astrowani.com/assets/vastu/wooden-sriparni-shriparni-kuber-yantra.jpg', NULL, true, 424
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Wooden Sriparni Shriparni Savan Shri Kuber Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shree Siddh Shukra Dev Yantra', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shree-siddh-shukra-dev-yantra.jpg', NULL, true, 425
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shree Siddh Shukra Dev Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Sarva Karya Siddhi Yantra Copper - Vastu Yantra for Wish Fulfillment and Success, Home and Office', NULL, 500.00, 600.00, 'https://shop.astrowani.com/assets/vastu/shri-sarva-manovanchit-karya-siddhi-vastu-yantra-copper.jpg', 'Vastu Enhancer', true, 426
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Sarva Karya Siddhi Yantra Copper - Vastu Yantra for Wish Fulfillment and Success, Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Nazar Dosh Nivaran Yantra (Multi Color)', NULL, 550.00, 650.00, 'https://shop.astrowani.com/assets/vastu/vastu-nazar-dosh-nivaran-yantra.jpg', 'Vastu Enhancer', true, 427
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Nazar Dosh Nivaran Yantra (Multi Color)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shriparni Kanakdhara Yantra to Attract Wealth Prosperity', NULL, 950.00, 1100.00, 'https://shop.astrowani.com/assets/vastu/wooden-sriparni-shriparni-kanakdhara-yantra.jpg', NULL, true, 428
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shriparni Kanakdhara Yantra to Attract Wealth Prosperity');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Nazar Dosh Nivaran Yantra (Copper)', NULL, 500.00, 650.00, 'https://shop.astrowani.com/assets/vastu/vastu-nazar-dosh-nivaran-yantra-copper.jpg', 'Vastu Enhancer', true, 429
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Nazar Dosh Nivaran Yantra (Copper)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Lagna Yog Yantra For Marriage', NULL, 600.00, 750.00, 'https://shop.astrowani.com/assets/vastu/lagna-yog-yantra.jpg', 'Vastu Enhancer', true, 430
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Lagna Yog Yantra For Marriage');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shree Siddh Rahu Dev Yantra Copper', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shree-siddh-rahu-dev-yantra.jpg', NULL, true, 431
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shree Siddh Rahu Dev Yantra Copper');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Swastik for Vastu - Auspicious Good Luck Symbol and Pooja Idol for Home and Office', NULL, 900.00, 1100.00, 'https://shop.astrowani.com/assets/vastu/brass-swastik.jpg', 'Pyramids', true, 432
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Swastik for Vastu - Auspicious Good Luck Symbol and Pooja Idol for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shree Siddh Ketu Dev Yantra', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shree-siddh-ketu-dev-yantra.jpg', NULL, true, 433
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shree Siddh Ketu Dev Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shree Siddh Mangal Dev Yantra', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shree-siddh-mangal-dev-yantra.jpg', NULL, true, 434
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shree Siddh Mangal Dev Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shungite Stone Moblie Chip - Protects against harmful effects of Electromagnetic Radiation from Cell phones', NULL, 1000.00, 1200.00, 'https://shop.astrowani.com/assets/vastu/shungite-stone-moblie-chip.jpg', 'Crystals', true, 435
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shungite Stone Moblie Chip - Protects against harmful effects of Electromagnetic Radiation from Cell phones');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Court Kacheri Vijay Prapti Yantra with attractive box', NULL, 950.00, 1150.00, 'https://shop.astrowani.com/assets/vastu/court-kacheri-vijay-prapti-yantra.jpg', 'Vastu Enhancer', true, 436
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Court Kacheri Vijay Prapti Yantra with attractive box');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shree Siddh Surya Dev Yantra', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/shree-siddh-surya-dev-yantra.jpg', NULL, true, 437
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shree Siddh Surya Dev Yantra');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Om Wall Hanging - Auspicious Vastu Remedy for Good Luck, Success, and Positive Energy', NULL, 900.00, 1100.00, 'https://shop.astrowani.com/assets/vastu/brass-om-wall-hanging.jpg', 'Pyramids', true, 438
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Om Wall Hanging - Auspicious Vastu Remedy for Good Luck, Success, and Positive Energy');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Green Jade Square Stone Cube Reiki Healing Aura Chakra Vastu Feng Shui', NULL, 550.00, 750.00, 'https://shop.astrowani.com/assets/vastu/green-jade-square-stone-cube.jpg', 'Crystals', true, 439
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Green Jade Square Stone Cube Reiki Healing Aura Chakra Vastu Feng Shui');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Swastik Yantra in Attractive Box', NULL, 850.00, 950.00, 'https://shop.astrowani.com/assets/vastu/copper-swastik-yantra-box.jpg', 'Vastu Enhancer', true, 440
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Swastik Yantra in Attractive Box');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Kailash Dhanraksha Yantra in Metal Gift Box', NULL, 950.00, 1350.00, 'https://shop.astrowani.com/assets/vastu/kailash-dhan-raksha-yantra-metal-box.jpg', 'Vastu Enhancer', true, 441
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Kailash Dhanraksha Yantra in Metal Gift Box');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Copper Swastik Yantra for Vastu - Auspicious Energy and Dosh Remedy for Home and Office', NULL, 400.00, 500.00, 'https://shop.astrowani.com/assets/vastu/copper-swastik-yantra.jpg', 'Vastu Enhancer', true, 442
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Copper Swastik Yantra for Vastu - Auspicious Energy and Dosh Remedy for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Egyptian Wooden Pyramid Reiki Wish Box Cash Box Vastu Fengshui Remedies for Home and Office', NULL, 850.00, 1050.00, 'https://shop.astrowani.com/assets/vastu/wooden-pyramid-wish-box-egyptian-symbol.jpg', 'Feng Shui', true, 443
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Egyptian Wooden Pyramid Reiki Wish Box Cash Box Vastu Fengshui Remedies for Home and Office');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Reiki Symbol Wooden Wish Box Cash Box Pyramid', NULL, 750.00, 1400.00, 'https://shop.astrowani.com/assets/vastu/reiki-symbol-wooden-wish-box-cash-box-pyramid.jpg', 'Pyramids', true, 444
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Reiki Symbol Wooden Wish Box Cash Box Pyramid');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Vastu Feng Shui Crystal Glass Pyramid with Stand for Positive Vibrations, Prosperity and Good Luck', NULL, 500.00, 799.00, 'https://shop.astrowani.com/assets/vastu/crystal-glass-pyramid-with-stand.jpg', 'Crystals', true, 445
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Vastu Feng Shui Crystal Glass Pyramid with Stand for Positive Vibrations, Prosperity and Good Luck');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Shubh Labh Kalash Door Hangings (Pair)', NULL, 1400.00, 1999.00, 'https://shop.astrowani.com/assets/vastu/shubh-labh-kalash-door-hangings-pair.jpg', 'Vastu Enhancer', true, 446
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Shubh Labh Kalash Door Hangings (Pair)');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Feng Shui Vastu Wooden Wish Box Cash Box Pyramid for Storing Cash, Crystals, Jewellery, Medicines', NULL, 750.00, 1000.00, 'https://shop.astrowani.com/assets/vastu/wooden-wish-box-cash-box-pyramid.jpg', 'Pyramids', true, 447
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Feng Shui Vastu Wooden Wish Box Cash Box Pyramid for Storing Cash, Crystals, Jewellery, Medicines');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Brass Shift Arrow for Quick Vastu Remedies', NULL, 1200.00, NULL, 'https://shop.astrowani.com/assets/vastu/brass-shift-arrow-vastu.jpg', 'Pyramids', true, 448
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Brass Shift Arrow for Quick Vastu Remedies');
INSERT INTO public.remedy_items (type, title, description, price, mrp, image, subcategory, is_active, sort_order)
SELECT 'vastu', 'Luxor Bar (Atlantean Bar): A Sacred Geometry Tool for Energy Harmonization', NULL, 1350.00, 2400.00, 'https://shop.astrowani.com/assets/vastu/luxor-bar-atlantean-bar.jpg', NULL, true, 449
WHERE NOT EXISTS (SELECT 1 FROM public.remedy_items WHERE type = 'vastu' AND title = 'Luxor Bar (Atlantean Bar): A Sacred Geometry Tool for Energy Harmonization');

COMMIT;

DO $$
DECLARE n bigint; n_img bigint; n_cat bigint;
BEGIN
  SELECT count(*), count(image), count(subcategory) INTO n, n_img, n_cat
    FROM public.remedy_items WHERE type = 'vastu';
  RAISE NOTICE 'vastu items: %, with an image: %, grouped: %', n, n_img, n_cat;
  RAISE NOTICE 'They will NOT appear for sale until remedy_orders_enabled_vastu is true.';
END $$;

