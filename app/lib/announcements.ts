// 30+ original, absurd RER B announcements (parody — no real RATP/SNCF/IDFM branding).
export const ANNOUNCEMENTS: string[] = [
  "En raison d'un bagage oublié, votre dignité est retenue en gare.",
  "Le conducteur s'excuse, il ne sait pas non plus où on va.",
  "Contrôle en cours. Les fraudeurs sont priés de prendre un air naturel.",
  "Ce train est prolongé jusqu'à vos limites personnelles.",
  "Un voyageur a souri : ralentissement à prévoir.",
  "En raison de la présence d'un contrôleur, ce train circule au ralenti émotionnel.",
  "Votre ticket est valable, votre karma un peu moins.",
  "Prochain arrêt : le remords.",
  "Merci de laisser descendre avant de monter, et de frauder avant de contrôler.",
  "Le RER B vous rappelle qu'un fraudeur zen est un fraudeur pincé.",
  "Objet trouvé en voiture 2 : le sens des responsabilités d'un passager.",
  "En raison d'un incident voyageur, l'incident voyageur est lui-même en retard.",
  "Attention à la marche en descendant du train, et à l'amende en y montant.",
  "Ce train dessert toutes les gares, sauf celles qu'il n'a pas envie.",
  "Un contrôleur invisible vous observe. Peut-être. Ou pas. Bonne chance.",
  "La voiture 3 est réservée aux gens qui ont vraiment payé. Théoriquement.",
  "En raison du beau temps, la fraude est particulièrement tentante aujourd'hui.",
  "Nous vous rappelons que composter son ticket, ce n'est pas composter ses regrets.",
  "Le train est à l'heure. Nous enquêtons pour comprendre pourquoi.",
  "Signalez tout comportement suspect, comme payer son billet sans raison.",
  "Un troupeau de contrôleurs a été aperçu à Gare du Nord. Restez groupés.",
  "En cas de contrôle, respirez. Ça ne servira à rien, mais respirez.",
  "Ce message a été enregistré par quelqu'un qui, lui non plus, n'avait pas de ticket.",
  "Le wifi du train est aussi fiable que votre excuse au contrôleur.",
  "Prochain arrêt : Châtelet. Correspondance avec vos mauvaises décisions.",
  "Les fraudeurs de la voiture 1 sont priés de rejoindre la voiture des illusions perdues.",
  "En raison d'une régulation du trafic, le suspense est maintenu jusqu'au terminus.",
  "Nous roulons à vive allure pour rattraper le retard de votre honnêteté.",
  "Un passager a payé deux fois. Une minute de silence.",
  "Le contrôleur de ce train a un quota. Ne soyez pas son chiffre du jour.",
  "Ce train est climatisé par la sueur froide des fraudeurs.",
  "Terminus Aéroport : merci d'emporter vos amendes avec vous.",
  "Rappel : frauder n'est pas un sport olympique, malgré votre technique.",
  "En raison d'un contrôle inopiné, votre plan parfait vient d'être annulé.",
];

// Original 3-note chime frequencies (a friendly major-ish arpeggio, not any real jingle).
export const CHIME_NOTES = [659.25, 830.61, 987.77]; // E5, G#5, B5

export function pickAnnouncement(seed: number): string {
  return ANNOUNCEMENTS[Math.abs(seed) % ANNOUNCEMENTS.length];
}
