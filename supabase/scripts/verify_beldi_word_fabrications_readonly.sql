-- Read-only Beldi fabrication verification extracted from Fiche Beldi-2.docx.
-- Run this in Supabase SQL editor. It only SELECTs data and returns one report row.

with expected_word_links(source_table, source_tables, word_target_name, expected_target_type, word_component_name, component_kind_hint) as (
  values
    (49, '49,50,51', 'baklava', 'finished', 'Amande noir', 'raw'),
    (49, '49,50,51', 'baklava', 'finished', 'Farce Baklava', 'semi_finished'),
    (49, '49,50,51', 'baklava', 'finished', 'Nappage', 'raw'),
    (49, '49,50,51', 'baklava', 'finished', 'Pate Baklava', 'semi_finished'),
    (11, '11,12', 'Behla', 'finished', 'Amande Haché', 'raw'),
    (11, '11,12', 'Behla', 'finished', 'Cannelle', 'raw'),
    (11, '11,12', 'Behla', 'finished', 'Farine', 'raw'),
    (11, '11,12', 'Behla', 'finished', 'Fenouil', 'raw'),
    (11, '11,12', 'Behla', 'finished', 'Huile', 'raw'),
    (11, '11,12', 'Behla', 'finished', 'Levure', 'raw'),
    (11, '11,12', 'Behla', 'finished', 'sel', 'raw'),
    (11, '11,12', 'Behla', 'finished', 'Sésame', 'raw'),
    (11, '11,12', 'Behla', 'finished', 'Sucre glacé', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'Amande Haché', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'Cannelle', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'Farine', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'Fenouil', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'Huile', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'Levure', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'sel', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'Sésame', 'raw'),
    (9, '9,10', 'Behla Mini', 'finished', 'Sucre glacé', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Amande Haché', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Cannelle', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Colorant', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Farine', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Fenouil', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Huile', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Levure', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'sel', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Sésame', 'raw'),
    (129, '129,130', 'Behla prestige', 'finished', 'Sucre glacé', 'raw'),
    (118, '118,119,120', 'Biscuit salé', 'finished', 'Amande', 'raw'),
    (118, '118,119,120', 'Biscuit salé', 'finished', 'Amande effilé', 'raw'),
    (118, '118,119,120', 'Biscuit salé', 'finished', 'Mélange de graines', 'raw'),
    (118, '118,119,120', 'Biscuit salé', 'finished', 'Pâte sablée', 'semi_finished'),
    (118, '118,119,120', 'Biscuit salé', 'finished', 'Tournesol', 'raw'),
    (70, '70,71,72', 'Chahda', 'finished', 'Amande haché', 'raw'),
    (70, '70,71,72', 'Chahda', 'finished', 'Pate Chahda', 'semi_finished'),
    (52, '52,53', 'Cookies drops', 'finished', 'Beurre spéciale', 'raw'),
    (52, '52,53', 'Cookies drops', 'finished', 'Drops', 'raw'),
    (52, '52,53', 'Cookies drops', 'finished', 'Farine', 'raw'),
    (52, '52,53', 'Cookies drops', 'finished', 'levure', 'raw'),
    (52, '52,53', 'Cookies drops', 'finished', 'Pistache', 'raw'),
    (52, '52,53', 'Cookies drops', 'finished', 'Sucre glace', 'raw'),
    (52, '52,53', 'Cookies drops', 'finished', 'Œuf', 'raw'),
    (52, '52,53', 'Cookies drops', 'finished', 'vanille', 'raw'),
    (54, '54,55', 'Cookies drops Pistache', 'finished', 'Beurre spéciale', 'raw'),
    (54, '54,55', 'Cookies drops Pistache', 'finished', 'Drops', 'raw'),
    (54, '54,55', 'Cookies drops Pistache', 'finished', 'Farine', 'raw'),
    (54, '54,55', 'Cookies drops Pistache', 'finished', 'levure', 'raw'),
    (54, '54,55', 'Cookies drops Pistache', 'finished', 'Pistache', 'raw'),
    (54, '54,55', 'Cookies drops Pistache', 'finished', 'Sucre glace', 'raw'),
    (54, '54,55', 'Cookies drops Pistache', 'finished', 'Œuf', 'raw'),
    (54, '54,55', 'Cookies drops Pistache', 'finished', 'vanille', 'raw'),
    (40, '40,41,42', 'Corne gazelle', 'semi_finished', 'Pate amande', 'semi_finished'),
    (40, '40,41,42', 'Corne gazelle', 'semi_finished', 'Pate corn gazelle', 'semi_finished'),
    (97, '97,98,99', 'Diamantine', 'semi_finished', 'Ganache Caramel', 'semi_finished'),
    (97, '97,98,99', 'Diamantine', 'semi_finished', 'Nougat sésame', 'semi_finished'),
    (97, '97,98,99', 'Diamantine', 'semi_finished', 'Pâte sablée', 'semi_finished'),
    (97, '97,98,99', 'Diamantine', 'semi_finished', 'Praliné Amande', 'semi_finished'),
    (46, '46,47,48', 'Farce baklava', 'semi_finished', 'Amande noir', 'raw'),
    (46, '46,47,48', 'Farce baklava', 'semi_finished', 'Beurre spécial', 'raw'),
    (46, '46,47,48', 'Farce baklava', 'semi_finished', 'Cannelle', 'raw'),
    (46, '46,47,48', 'Farce baklava', 'semi_finished', 'Sucre glacé', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Amande', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'B. Spécial', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Cannelle', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Eau de Fleur', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Farine', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Gingembre', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Huile', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Lait', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Levure', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Noix', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'sel', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Sucre semoule', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Œuf', 'raw'),
    (121, '121', 'Fekkas prestige', 'finished', 'Vanille', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Amande', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Amande Haché', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Cannelle', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Farine', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Fenouil', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Huile', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Lait', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Levure', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Sel', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Sésame', 'raw'),
    (15, '15,16', 'Fekkas sans sucre', 'finished', 'Vanille', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Amande', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Amande Haché', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Confiture Zakia', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Farine', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Fenouil', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Huile', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Levure', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Noix', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'sel', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Sésame', 'raw'),
    (13, '13,14', 'Fekkas sucré', 'semi_finished', 'Sucre semoule', 'raw'),
    (91, '91,92,93', 'Ganache Caramel', 'semi_finished', 'Gala blanc', 'raw'),
    (91, '91,92,93', 'Ganache Caramel', 'semi_finished', 'Glucose', 'raw'),
    (91, '91,92,93', 'Ganache Caramel', 'semi_finished', 'Miel', 'raw'),
    (91, '91,92,93', 'Ganache Caramel', 'semi_finished', 'Nestlé caramel', 'raw'),
    (82, '82,83,84', 'Ganache choco café', 'semi_finished', 'Gala noir', 'raw'),
    (82, '82,83,84', 'Ganache choco café', 'semi_finished', 'Glucose', 'raw'),
    (82, '82,83', 'Ganache choco café', 'semi_finished', 'miel', 'raw'),
    (82, '82,83,84', 'Ganache choco café', 'semi_finished', 'Nappage', 'raw'),
    (82, '82,83,84', 'Ganache choco café', 'semi_finished', 'Trablit café', 'raw'),
    (85, '85,86,87', 'Ganache Citron', 'semi_finished', 'Arome citron', 'raw'),
    (85, '85,86,87', 'Ganache Citron', 'semi_finished', 'Gala blanc', 'raw'),
    (85, '85,86,87', 'Ganache Citron', 'semi_finished', 'Glucose', 'raw'),
    (85, '85,86,87', 'Ganache Citron', 'semi_finished', 'Nappage', 'raw'),
    (88, '88,89,90', 'Ganache Pistache', 'semi_finished', 'Arome Pistache', 'raw'),
    (88, '88,89,90', 'Ganache Pistache', 'semi_finished', 'Gala blanc', 'raw'),
    (88, '88,89,90', 'Ganache Pistache', 'semi_finished', 'Glucose', 'raw'),
    (88, '88,89,90', 'Ganache Pistache', 'semi_finished', 'Nappage', 'raw'),
    (126, '126,127,128', 'Garga3a', 'semi_finished', 'Ganache (selon stock)', 'semi_finished'),
    (126, '126,127,128', 'Garga3a', 'semi_finished', 'Noix', 'raw'),
    (126, '126,127,128', 'Garga3a', 'semi_finished', 'Pâte sablée', 'semi_finished'),
    (58, '58,59,60', 'Ghraiba effilée', 'finished', 'Amande effilée', 'raw'),
    (58, '58,59,60', 'Ghraiba effilée', 'finished', 'Nappage', 'raw'),
    (58, '58,59,60', 'Ghraiba effilée', 'finished', 'PATE Ghraiba effilée', 'semi_finished'),
    (64, '64,65,66', 'Ghraiba effilée café', 'finished', 'Amand noire/ noix', 'raw'),
    (64, '64,65,66', 'Ghraiba effilée café', 'finished', 'Amande effilée', 'raw'),
    (64, '64,65,66', 'Ghraiba effilée café', 'finished', 'Nappage', 'raw'),
    (64, '64,65,66', 'Ghraiba effilée café', 'finished', 'PATE Ghraiba effilée café', 'semi_finished'),
    (115, '115,116,117', 'Ghraiba effilée Noix', 'finished', 'Amande effilée', 'raw'),
    (115, '115,116,117', 'Ghraiba effilée Noix', 'finished', 'Nappage', 'raw'),
    (115, '115,116,117', 'Ghraiba effilée Noix', 'finished', 'Noix', 'raw'),
    (115, '115,116,117', 'Ghraiba effilée Noix', 'finished', 'PATE Noix', 'semi_finished'),
    (122, '122,123,124,125', 'Mhencha Pate Bastille', 'finished', 'Pate bastille', 'semi_finished'),
    (122, '122,123,124,125', 'Mhencha Pate Bastille', 'finished', 'Pâte Mhencha', 'semi_finished'),
    (28, '28,29', 'Mhencha Pistache', 'finished', 'Amande haché', 'raw'),
    (28, '28,29', 'Mhencha Pistache', 'finished', 'Cornflower', 'raw'),
    (28, '28,29', 'Mhencha Pistache', 'finished', 'Nappage', 'raw'),
    (28, '28,29', 'Mhencha Pistache', 'finished', 'PATE Mhencha Pistache', 'semi_finished'),
    (28, '28,29', 'Mhencha Pistache', 'finished', 'Pistache', 'raw'),
    (100, '100,101,102', 'Nougat haché', 'semi_finished', 'Amande haché', 'raw'),
    (100, '100,101,102', 'Nougat haché', 'semi_finished', 'Beurre spéciale', 'raw'),
    (100, '100,101,102', 'Nougat haché', 'semi_finished', 'Gala blanc', 'raw'),
    (100, '100,101,102', 'Nougat haché', 'semi_finished', 'Glucose', 'raw'),
    (100, '100,101,102', 'Nougat haché', 'semi_finished', 'Pistache', 'raw'),
    (100, '100,101,102', 'Nougat haché', 'semi_finished', 'Sucre semoule', 'raw'),
    (94, '94,95,96', 'Nougat sésame', 'semi_finished', 'Beurre spéciale', 'raw'),
    (94, '94,95,96', 'Nougat sésame', 'semi_finished', 'Chocolat blanc', 'raw'),
    (94, '94,95,96', 'Nougat sésame', 'semi_finished', 'Glucose', 'raw'),
    (94, '94,95,96', 'Nougat sésame', 'semi_finished', 'Sésame blanc', 'raw'),
    (94, '94,95,96', 'Nougat sésame', 'semi_finished', 'Sucre semoule', 'raw'),
    (112, '112,113,114', 'Nougat Tournesol', 'semi_finished', 'Beurre spéciale', 'raw'),
    (112, '112,113,114', 'Nougat Tournesol', 'semi_finished', 'Gala blanc', 'raw'),
    (112, '112,113,114', 'Nougat Tournesol', 'semi_finished', 'Glucose', 'raw'),
    (112, '112,113,114', 'Nougat Tournesol', 'semi_finished', 'Sucre semoule', 'raw'),
    (112, '112,113,114', 'Nougat Tournesol', 'semi_finished', 'Tournesol', 'raw'),
    (34, '34,35,36', 'PATE AMANDE', 'semi_finished', 'Amande noire', 'raw'),
    (34, '34,35,36', 'PATE AMANDE', 'semi_finished', 'Beurre spécial', 'raw'),
    (34, '34,35,36', 'PATE AMANDE', 'semi_finished', 'Colorant', 'raw'),
    (34, '34,35,36', 'PATE AMANDE', 'semi_finished', 'Confiture Zakia', 'raw'),
    (34, '34,35,36', 'PATE AMANDE', 'semi_finished', 'Eau de fleure', 'raw'),
    (34, '34,35,36', 'PATE AMANDE', 'semi_finished', 'Sucre semoule', 'raw'),
    (43, '43,44,45', 'Pate baklava', 'semi_finished', 'Beurre spécial', 'raw'),
    (43, '43', 'Pate baklava', 'semi_finished', 'Colorant', 'raw'),
    (44, '44,45', 'Pate baklava', 'semi_finished', 'Eau de fleur', 'raw'),
    (43, '43,44,45', 'Pate baklava', 'semi_finished', 'Farine', 'raw'),
    (43, '43,44,45', 'Pate baklava', 'semi_finished', 'sel', 'raw'),
    (43, '43,44,45', 'Pate baklava', 'semi_finished', 'Sucre glacé', 'raw'),
    (67, '67,68,69', 'Pate Chahda', 'semi_finished', 'Amande noir concassé', 'raw'),
    (67, '67,68,69', 'Pate Chahda', 'semi_finished', 'Arome orange', 'raw'),
    (67, '67,68,69', 'Pate Chahda', 'semi_finished', 'Confiture Zakia', 'raw'),
    (67, '67,68,69', 'Pate Chahda', 'semi_finished', 'Eau florale', 'raw'),
    (67, '67,68,69', 'Pate Chahda', 'semi_finished', 'Ecorces d’orange', 'raw'),
    (37, '37,38,39', 'Pate corne gazelle', 'semi_finished', 'Beurre spécial', 'raw'),
    (37, '37,38,39', 'Pate corne gazelle', 'semi_finished', 'Colorant', 'raw'),
    (37, '37,38,39', 'Pate corne gazelle', 'semi_finished', 'Eau floral', 'raw'),
    (37, '37,38,39', 'Pate corne gazelle', 'semi_finished', 'Farine', 'raw'),
    (37, '37,38,39', 'Pate corne gazelle', 'semi_finished', 'Huile végétale', 'raw'),
    (37, '37,38,39', 'Pate corne gazelle', 'semi_finished', 'Miel', 'raw'),
    (56, '56,57', 'Pate ghraiba effilée', 'semi_finished', 'Arome orange', 'raw'),
    (56, '56,57', 'Pate ghraiba effilée', 'semi_finished', 'Ecorces d’orange', 'raw'),
    (56, '56,57', 'Pate ghraiba effilée', 'semi_finished', 'Levure', 'raw'),
    (56, '56,57', 'Pate ghraiba effilée', 'semi_finished', 'Pate amande', 'semi_finished'),
    (56, '56,57', 'Pate ghraiba effilée', 'semi_finished', 'Trablit café', 'raw'),
    (56, '56,57', 'Pate ghraiba effilée', 'semi_finished', 'Œuf', 'raw'),
    (25, '25,26,27', 'PATE Mhencha Pistache', 'semi_finished', 'Amande noir', 'raw'),
    (25, '25,26,27', 'PATE Mhencha Pistache', 'semi_finished', 'Arome pistache', 'raw'),
    (25, '25,26,27', 'PATE Mhencha Pistache', 'semi_finished', 'Beurre spécial', 'raw'),
    (25, '25,26,27', 'PATE Mhencha Pistache', 'semi_finished', 'Confiture Zakia', 'raw'),
    (25, '25,26,27', 'PATE Mhencha Pistache', 'semi_finished', 'Eau florale', 'raw'),
    (25, '25,26,27', 'PATE Mhencha Pistache', 'semi_finished', 'Pistache haché', 'raw'),
    (25, '25,26,27', 'PATE Mhencha Pistache', 'semi_finished', 'Sucre semoule', 'raw'),
    (109, '109,110,111', 'Pate Noix', 'semi_finished', 'Amande haché', 'raw'),
    (109, '109,110,111', 'Pate Noix', 'semi_finished', 'Arome café', 'raw'),
    (109, '109,110,111', 'Pate Noix', 'semi_finished', 'Beurre spécial', 'raw'),
    (109, '109,110,111', 'Pate Noix', 'semi_finished', 'Confiture', 'raw'),
    (109, '109,110,111', 'Pate Noix', 'semi_finished', 'Eau de fleur', 'raw'),
    (109, '109,110,111', 'Pate Noix', 'semi_finished', 'Noix haché', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'Amande', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'Beurre spécial', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'Farine', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'Huile', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'Levure', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'Maïzena', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'sel', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'Sucre glacé', 'raw'),
    (17, '17,18', 'PATE Raffaelo Coco', 'semi_finished', 'Vanille', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'Beurre spécial', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'Farine', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'Huile', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'Levure', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'Maïzena', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'Noisette', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'sel', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'Sucre glacé', 'raw'),
    (19, '19,20', 'PATE Raffaelo Kunafa', 'semi_finished', 'Vanille', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'Arome citron', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'Beurre spécial', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'farine', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'Huile', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'Levure', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'sel', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'Sucre semoule', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'Œufs', 'raw'),
    (5, '5,6', 'PATE Richbond', 'semi_finished', 'Vanille', 'raw'),
    (30, '30,31', 'PATE Sablée', 'semi_finished', 'Arome orange', 'raw'),
    (30, '30,31', 'PATE Sablée', 'semi_finished', 'Beurre bonna', 'raw'),
    (30, '30,31', 'PATE Sablée', 'semi_finished', 'Beurre spécial', 'raw'),
    (30, '30,31', 'PATE Sablée', 'semi_finished', 'Farine', 'raw'),
    (30, '30,31', 'PATE Sablée', 'semi_finished', 'Glucose', 'raw'),
    (30, '30,31', 'PATE Sablée', 'semi_finished', 'Huile végétale', 'raw'),
    (30, '30,31', 'PATE Sablée', 'semi_finished', 'Sel', 'raw'),
    (30, '30,31', 'PATE Sablée', 'semi_finished', 'Œufs', 'raw'),
    (0, '0,1', 'PATE Sebbani', 'semi_finished', 'Amande haché', 'raw'),
    (0, '0,1', 'PATE Sebbani', 'semi_finished', 'cannelle', 'raw'),
    (0, '0,1', 'PATE Sebbani', 'semi_finished', 'farine', 'raw'),
    (0, '0,1', 'PATE Sebbani', 'semi_finished', 'Huile végétale', 'raw'),
    (0, '0,1', 'PATE Sebbani', 'semi_finished', 'Levure', 'raw'),
    (0, '0,1', 'PATE Sebbani', 'semi_finished', 'Sel', 'raw'),
    (0, '0,1', 'PATE Sebbani', 'semi_finished', 'Sucre glacé', 'raw'),
    (103, '103,104,105', 'Praliné Amande', 'semi_finished', 'Amande noir', 'raw'),
    (103, '103,104,105', 'Praliné Amande', 'semi_finished', 'Huile végétale', 'raw'),
    (103, '103,104,105', 'Praliné Amande', 'semi_finished', 'Sucre glacé', 'raw'),
    (106, '106,107,108', 'Praliné Pistache', 'semi_finished', 'Huile végétale', 'raw'),
    (106, '106,107,108', 'Praliné Pistache', 'semi_finished', 'Pistache', 'raw'),
    (106, '106,107,108', 'Praliné Pistache', 'semi_finished', 'Sucre glacé', 'raw'),
    (21, '21,22', 'Raffaelo Coco', 'finished', 'Chocolat blanc', 'raw'),
    (21, '21,22', 'Raffaelo Coco', 'finished', 'PATE Raffaelo', 'semi_finished'),
    (21, '21,22', 'Raffaelo Coco', 'finished', 'Poudre de coco', 'raw'),
    (23, '23,24', 'Raffaelo Kunafa', 'finished', 'Chocolat blanc', 'raw'),
    (23, '23,24', 'Raffaelo Kunafa', 'finished', 'Kunafa', 'raw'),
    (23, '23,24', 'Raffaelo Kunafa', 'finished', 'PATE Raffaelo', 'semi_finished'),
    (7, '7', 'Richbond', 'finished', 'Confiture', 'raw'),
    (8, '8', 'Richbond', 'finished', 'Confiture Zakia', 'raw'),
    (7, '7,8', 'Richbond', 'finished', 'Eau de fleur', 'raw'),
    (7, '7,8', 'Richbond', 'finished', 'Pate Richbond', 'semi_finished'),
    (7, '7,8', 'Richbond', 'finished', 'Poudre de coco', 'raw'),
    (76, '76,77,78', 'Sablée Caramel', 'semi_finished', 'Amande haché', 'raw'),
    (76, '76,77,78', 'Sablée Caramel', 'semi_finished', 'Ganache Caramel', 'semi_finished'),
    (76, '76,77,78', 'Sablée Caramel', 'semi_finished', 'Glucose', 'raw'),
    (76, '76,77,78', 'Sablée Caramel', 'semi_finished', 'Nappage', 'raw'),
    (76, '76,77,78', 'Sablée Caramel', 'semi_finished', 'Pâte Sablée', 'semi_finished'),
    (76, '76,77,78', 'Sablée Caramel', 'semi_finished', 'Pétales de fleurs', 'raw'),
    (79, '79,80,81', 'Sablée Citron', 'semi_finished', 'Ganache Citron', 'semi_finished'),
    (79, '79,80,81', 'Sablée Citron', 'semi_finished', 'Glucose', 'raw'),
    (79, '79,80,81', 'Sablée Citron', 'semi_finished', 'Nappage', 'raw'),
    (79, '79,80,81', 'Sablée Citron', 'semi_finished', 'Nougat Haché', 'semi_finished'),
    (79, '79,80,81', 'Sablée Citron', 'semi_finished', 'Pâte Sablée', 'semi_finished'),
    (73, '73,74,75', 'Sablée Pistache', 'semi_finished', 'Amande haché', 'raw'),
    (73, '73,74,75', 'Sablée Pistache', 'semi_finished', 'Ganache pistache', 'semi_finished'),
    (73, '73,74,75', 'Sablée Pistache', 'semi_finished', 'Glucose', 'raw'),
    (73, '73,74,75', 'Sablée Pistache', 'semi_finished', 'Nappage', 'raw'),
    (73, '73,74,75', 'Sablée Pistache', 'semi_finished', 'Pâte Sablée', 'semi_finished'),
    (73, '73,74,75', 'Sablée Pistache', 'semi_finished', 'Pistache', 'raw'),
    (61, '61,62,63', 'Sebbani boites', 'finished', 'Feuilletine', 'raw'),
    (61, '61,62,63', 'Sebbani boites', 'finished', 'Pate Sebbani', 'semi_finished'),
    (2, '2,3,4', 'Sebbani GR', 'finished', 'Chocolat blanc', 'raw'),
    (2, '2,3,4', 'Sebbani GR', 'finished', 'Feuilletine', 'raw'),
    (2, '2,3,4', 'Sebbani GR', 'finished', 'Pate Sebbani', 'semi_finished'),
    (32, '32,33', 'Tarte Fruit Secs', 'finished', 'Acajou', 'raw'),
    (32, '32,33', 'Tarte Fruit Secs', 'finished', 'Amande', 'raw'),
    (32, '32,33', 'Tarte Fruit Secs', 'finished', 'Glucose', 'raw'),
    (32, '32,33', 'Tarte Fruit Secs', 'finished', 'Miel', 'raw'),
    (32, '32,33', 'Tarte Fruit Secs', 'finished', 'Nappage', 'raw'),
    (32, '32,33', 'Tarte Fruit Secs', 'finished', 'Noisette', 'raw'),
    (32, '32,33', 'Tarte Fruit Secs', 'finished', 'PATE Sablée', 'semi_finished'),
    (32, '32,33', 'Tarte Fruit Secs', 'finished', 'Pistache', 'raw')
),
name_alias(word_name, db_name) as (
  values
    ('Amand noire/ noix', 'Amande noire'),
    ('Amande', 'Amande noire'),
    ('Amande Haché', 'Amande hachée'),
    ('Amande haché', 'Amande hachée'),
    ('Amande noir', 'Amande noire'),
    ('Amande noir concassé', 'Amande noire'),
    ('Amande noire concassée', 'Amande noire'),
    ('Amande effilé', 'Amande effilée'),
    ('Arome café', 'Arôme café'),
    ('Arome citron', 'Arôme citron'),
    ('Arome orange', 'Arôme orange'),
    ('Arome pistache', 'Arôme pistache'),
    ('Arome Pistache', 'Arôme pistache'),
    ('B. Spécial', 'Beurre'),
    ('Beurre bonna', 'Beurre Bonna'),
    ('Beurre spécial', 'Beurre'),
    ('Beurre spéciale', 'Beurre'),
    ('Chocolat blanc', 'Gala blanc'),
    ('Eau de Fleur', 'Eau de fleur'),
    ('Eau de fleure', 'Eau de fleur'),
    ('Eau floral', 'Eau de fleur'),
    ('Eau florale', 'Eau de fleur'),
    ('Ecorces d’orange', 'Ecorces d''orange'),
    ('Écorces d’orange', 'Ecorces d''orange'),
    ('OEufs', 'Œufs'),
    ('Œuf', 'Œufs'),
    ('Pate amande', 'PATE AMANDE'),
    ('Pate corn gazelle', 'Pate corne gazelle'),
    ('Pate Richbond', 'PATE Richbond'),
    ('Pate Sebbani', 'PATE Sebbani'),
    ('Pâte sablée', 'PATE Sablée'),
    ('Pâte Sablée', 'PATE Sablée'),
    ('Pate ghraiba effilée café', 'Pate ghraiba effilée'),
    ('PATE Ghraiba effilée', 'Pate ghraiba effilée'),
    ('PATE Ghraiba effilée café', 'Pate ghraiba effilée'),
    ('Farine', 'Farine lux'),
    ('farine', 'Farine lux'),
    ('Huile végétale', 'Huile'),
    ('Kunafa', 'Konafa'),
    ('Mélange de graines', 'Mélanges de graines'),
    ('Nappage', 'Nappage normal'),
    ('Noix haché', 'Noix'),
    ('Noix hachée', 'Noix'),
    ('Pistache haché', 'Pistache'),
    ('Pistache hachée', 'Pistache'),
    ('Poudre de coco', 'Poudre cacao'),
    ('Praliné Amande', 'Praline amande'),
    ('Praliné Pistache', 'Praline pistache'),
    ('Sésame blanc', 'Sésame'),
    ('Sucre glace', 'Sucre glacé'),
    ('Trablit café', 'Extrait liquide café'),
    ('Vanille', 'Poudre vanille'),
    ('vanille', 'Poudre vanille')
),
expected_links_raw as (
  select
    source_table,
    source_tables,
    word_target_name,
    coalesce(target_alias.db_name, word_target_name) as expected_target_name,
    expected_target_type,
    word_component_name,
    case
      when lower(trim(word_component_name)) = lower('PATE Raffaelo')
       and lower(trim(coalesce(target_alias.db_name, word_target_name))) = lower('Raffaelo Coco')
        then 'PATE Raffaelo coco'
      when lower(trim(word_component_name)) = lower('PATE Raffaelo')
       and lower(trim(coalesce(target_alias.db_name, word_target_name))) = lower('Raffaelo Kunafa')
        then 'PATE Raffaelo kunafa'
      else coalesce(component_alias.db_name, word_component_name)
    end as expected_component_name,
    component_kind_hint
  from expected_word_links
  left join name_alias target_alias
    on lower(trim(target_alias.word_name)) = lower(trim(expected_word_links.word_target_name))
  left join name_alias component_alias
    on lower(trim(component_alias.word_name)) = lower(trim(expected_word_links.word_component_name))
),
expected_links as (
  select
    min(source_table) as source_table,
    string_agg(distinct source_tables, ', ' order by source_tables) as source_tables,
    min(word_target_name) as word_target_name,
    expected_target_name,
    expected_target_type,
    min(word_component_name) as word_component_name,
    expected_component_name,
    component_kind_hint
  from expected_links_raw
  group by
    expected_target_name,
    expected_target_type,
    expected_component_name,
    component_kind_hint
),
expected_targets as (
  select distinct expected_target_name, expected_target_type
  from expected_links
),
expected_components as (
  select distinct expected_component_name, component_kind_hint
  from expected_links
),
found_target_products as (
  select
    expected_targets.expected_target_name,
    expected_targets.expected_target_type,
    products.id,
    products.name as db_name,
    products.type::text as db_type,
    products.category as db_category
  from expected_targets
  join products
    on products.is_active = true
   and lower(trim(products.name)) = lower(trim(expected_targets.expected_target_name))
),
found_expected_targets as (
  select distinct expected_target_name, expected_target_type
  from found_target_products
),
missing_target_products as (
  select expected_targets.*
  from expected_targets
  where not exists (
    select 1
    from found_expected_targets
    where found_expected_targets.expected_target_name = expected_targets.expected_target_name
      and found_expected_targets.expected_target_type = expected_targets.expected_target_type
  )
),
target_products_saved_differently_than_word as (
  select found_target_products.*
  from found_target_products
  where found_target_products.db_type <> found_target_products.expected_target_type
     or lower(coalesce(found_target_products.db_category, '')) <> 'beldi'
),
found_component_products as (
  select
    expected_components.expected_component_name,
    expected_components.component_kind_hint,
    products.id,
    products.name as db_name,
    products.type::text as db_type,
    products.category as db_category
  from expected_components
  join products
    on products.is_active = true
   and lower(trim(products.name)) = lower(trim(expected_components.expected_component_name))
   and products.type::text in ('raw', 'semi_finished')
),
missing_component_products as (
  select expected_components.*
  from expected_components
  where not exists (
    select 1
    from found_component_products
    where found_component_products.expected_component_name = expected_components.expected_component_name
  )
),
ambiguous_target_matches as (
  select
    expected_target_name,
    expected_target_type,
    count(*) as match_count,
    jsonb_agg(jsonb_build_object('id', id, 'name', db_name, 'type', db_type, 'category', db_category) order by db_name, id) as matches
  from found_target_products
  group by expected_target_name, expected_target_type
  having count(*) > 1
),
ambiguous_component_matches as (
  select
    expected_component_name,
    count(*) as match_count,
    jsonb_agg(jsonb_build_object('id', id, 'name', db_name, 'type', db_type, 'category', db_category) order by db_name, id) as matches
  from found_component_products
  group by expected_component_name
  having count(*) > 1
),
active_target_recipes as (
  select
    found_target_products.expected_target_name,
    found_target_products.expected_target_type,
    found_target_products.id as target_id,
    recipes.id as recipe_id
  from found_target_products
  join recipes
    on recipes.product_id = found_target_products.id
   and recipes.is_active = true
),
actual_links as (
  select
    active_target_recipes.expected_target_name,
    active_target_recipes.expected_target_type,
    component.name as actual_component_name,
    component.type::text as actual_component_type,
    recipe_components.recipe_id
  from active_target_recipes
  join recipe_components
    on recipe_components.recipe_id = active_target_recipes.recipe_id
  join products component
    on component.id = recipe_components.component_product_id
),
missing_component_links as (
  select
    expected_links.source_tables,
    expected_links.word_target_name,
    expected_links.expected_target_name,
    expected_links.expected_target_type,
    expected_links.word_component_name,
    expected_links.expected_component_name,
    expected_links.component_kind_hint
  from expected_links
  where not exists (
    select 1
    from actual_links
    where actual_links.expected_target_name = expected_links.expected_target_name
      and actual_links.expected_target_type = expected_links.expected_target_type
      and lower(trim(actual_links.actual_component_name)) = lower(trim(expected_links.expected_component_name))
  )
),
extra_component_links as (
  select
    actual_links.expected_target_name,
    actual_links.expected_target_type,
    actual_links.actual_component_name,
    actual_links.actual_component_type
  from actual_links
  where not exists (
    select 1
    from expected_links
    where expected_links.expected_target_name = actual_links.expected_target_name
      and expected_links.expected_target_type = actual_links.expected_target_type
      and lower(trim(expected_links.expected_component_name)) = lower(trim(actual_links.actual_component_name))
  )
),
duplicate_active_recipe_targets as (
  select
    expected_target_name,
    expected_target_type,
    count(distinct recipe_id) as active_recipe_count
  from active_target_recipes
  group by expected_target_name, expected_target_type
  having count(distinct recipe_id) > 1
),
per_product_counts as (
  select
    expected_targets.expected_target_name,
    expected_targets.expected_target_type,
    count(distinct expected_links.expected_component_name) as expected_component_count,
    count(distinct actual_links.actual_component_name) as actual_component_count,
    count(distinct missing_component_links.expected_component_name) as missing_component_count,
    count(distinct extra_component_links.actual_component_name) as extra_component_count
  from expected_targets
  left join expected_links
    on expected_links.expected_target_name = expected_targets.expected_target_name
   and expected_links.expected_target_type = expected_targets.expected_target_type
  left join actual_links
    on actual_links.expected_target_name = expected_targets.expected_target_name
   and actual_links.expected_target_type = expected_targets.expected_target_type
  left join missing_component_links
    on missing_component_links.expected_target_name = expected_targets.expected_target_name
   and missing_component_links.expected_target_type = expected_targets.expected_target_type
  left join extra_component_links
    on extra_component_links.expected_target_name = expected_targets.expected_target_name
   and extra_component_links.expected_target_type = expected_targets.expected_target_type
  group by expected_targets.expected_target_name, expected_targets.expected_target_type
),
applied_aliases as (
  select distinct
    word_target_name,
    expected_target_name,
    word_component_name,
    expected_component_name
  from expected_links
  where word_target_name <> expected_target_name
     or word_component_name <> expected_component_name
)
select
  'Fiche Beldi-2.docx' as source_document,
  (select count(*) from expected_targets) as expected_product_count,
  (select count(*) from found_expected_targets) as found_product_count,
  (select count(*) from missing_target_products) as missing_product_count,
  (select count(*) from expected_components) as expected_component_product_count,
  (select count(*) from missing_component_products) as missing_component_product_count,
  (select count(*) from expected_links) as expected_component_link_count,
  (select count(*) from actual_links) as actual_component_link_count,
  (select count(*) from missing_component_links) as missing_component_link_count,
  (select count(*) from extra_component_links) as extra_component_link_count,
  (select count(*) from duplicate_active_recipe_targets) as duplicate_active_recipe_target_count,
  coalesce((select jsonb_agg(to_jsonb(missing_target_products) order by expected_target_name, expected_target_type) from missing_target_products), '[]'::jsonb) as missing_products,
  coalesce((select jsonb_agg(to_jsonb(target_products_saved_differently_than_word) order by expected_target_name, db_type, db_category) from target_products_saved_differently_than_word), '[]'::jsonb) as products_found_with_saved_type_or_category_different_from_word,
  coalesce((select jsonb_agg(to_jsonb(missing_component_products) order by expected_component_name) from missing_component_products), '[]'::jsonb) as missing_component_products,
  coalesce((select jsonb_agg(to_jsonb(missing_component_links) order by expected_target_name, expected_component_name) from missing_component_links), '[]'::jsonb) as missing_component_links,
  coalesce((select jsonb_agg(to_jsonb(extra_component_links) order by expected_target_name, actual_component_name) from extra_component_links), '[]'::jsonb) as extra_component_links,
  coalesce((select jsonb_agg(to_jsonb(ambiguous_target_matches) order by expected_target_name) from ambiguous_target_matches), '[]'::jsonb) as ambiguous_target_matches,
  coalesce((select jsonb_agg(to_jsonb(ambiguous_component_matches) order by expected_component_name) from ambiguous_component_matches), '[]'::jsonb) as ambiguous_component_matches,
  coalesce((select jsonb_agg(to_jsonb(duplicate_active_recipe_targets) order by expected_target_name) from duplicate_active_recipe_targets), '[]'::jsonb) as duplicate_active_recipe_targets,
  coalesce((select jsonb_agg(to_jsonb(per_product_counts) order by expected_target_name, expected_target_type) from per_product_counts), '[]'::jsonb) as per_product_counts,
  coalesce((select jsonb_agg(to_jsonb(applied_aliases) order by word_target_name, word_component_name) from applied_aliases), '[]'::jsonb) as applied_word_name_aliases;
