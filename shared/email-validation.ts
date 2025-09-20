import { z } from "zod";

// Major legitimate email providers
const LEGITIMATE_EMAIL_DOMAINS = new Set([
  // Major consumer providers
  'gmail.com', 'googlemail.com', 
  'yahoo.com', 'yahoo.co.uk', 'yahoo.ca', 'yahoo.com.au', 'yahoo.fr', 'yahoo.de', 'yahoo.it',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'hotmail.co.uk', 'hotmail.fr',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me',
  'fastmail.com', 'fastmail.fm',
  'zoho.com', 'zohomail.com',
  // Chinese providers (qq.com is legitimate, not disposable)
  'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com',
  
  // Common business domains
  'apple.com', 'microsoft.com', 'google.com', 'amazon.com', 'facebook.com', 'meta.com',
  'linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'snapchat.com', 'tiktok.com',
  'netflix.com', 'spotify.com', 'adobe.com', 'salesforce.com', 'slack.com', 'zoom.us',
  'dropbox.com', 'airbnb.com', 'uber.com', 'lyft.com', 'paypal.com', 'stripe.com',
  'shopify.com', 'square.com', 'intuit.com', 'turbotax.com', 'chase.com', 'bankofamerica.com',
  'wellsfargo.com', 'citibank.com', 'americanexpress.com', 'visa.com', 'mastercard.com'
]);

// Known disposable/temporary email domains to block
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', '2prong.com', '3d-painting.com',
  '7tags.com', '9ox.net', 'aaathats3as.com', 'abyssmail.com', 'ag.us.to', 'ajaxapp.net',
  'amilegit.com', 'amiri.net', 'amiriindustries.com', 'anonbox.net', 'anonymbox.com',
  'antichef.com', 'antichef.net', 'antispam.de', 'armyspy.com', 'artman-conception.com',
  'bigstring.com', 'binkmail.com', 'bio-muesli.net', 'bobmail.info', 'bodhi.lawlita.com',
  'bofthew.com', 'boun.cr', 'bouncr.com', 'breakthru.com', 'brefmail.com', 'brennendesreich.de',
  'broadbandninja.com', 'bsnow.net', 'bspamfree.org', 'bugmenot.com', 'bumpymail.com',
  'burnthespam.info', 'burstmail.info', 'buymoreplays.com', 'byom.de', 'c2.hu',
  'card.zp.ua', 'casualdx.com', 'cek.pm', 'centermail.com', 'centermail.net', 'chammy.info',
  'childsavetrust.org', 'chogmail.com', 'choicemail1.com', 'clixser.com', 'cmail.net',
  'cmail.org', 'coldemail.info', 'cool.fr.nf', 'correo.blogos.net', 'cosmorph.com',
  'courriel.fr.nf', 'courrieltemporaire.com', 'curryworld.de', 'cust.in', 'cuvox.de',
  'dacoolest.com', 'dandikmail.com', 'dayrep.com', 'deadaddress.com', 'deadfake.cf',
  'deadfake.ga', 'deadfake.ml', 'deadfake.tk', 'deadspam.com', 'despam.it', 'despammed.com',
  'devnullmail.com', 'dfgh.net', 'digitalsanctuary.com', 'dingbone.com', 'discard.email',
  'discardmail.com', 'discardmail.de', 'disposableaddress.com', 'disposableemailaddresses.com',
  'disposableinbox.com', 'dispose.it', 'disposeamail.com', 'disposemail.com', 'dispostable.com',
  'dm.de', 'dodgeit.com', 'dodgit.com', 'donemail.ru', 'dontreg.com', 'dontsendmespam.de',
  'drdrb.net', 'dump-email.info', 'dumpandjunk.com', 'dumpmail.de', 'dumpyemail.com',
  'e-mail.in', 'e-mail.org', 'e4ward.com', 'easytrashmail.com', 'einrot.com', 'emailgo.de',
  'emailias.com', 'emailinfive.com', 'emailmiser.com', 'emailsensei.com', 'emailtemporar.ro',
  'emailtemporario.com.br', 'emailthe.net', 'emailtmp.com', 'emailto.de', 'emailwarden.com',
  'emailx.at.hm', 'emailxfer.com', 'emeil.in', 'emeil.ir', 'emeraldwebmail.com', 'emz.net',
  'enterto.com', 'ephemail.net', 'ero-tube.org', 'etranquil.com', 'etranquil.net', 'etranquil.org',
  'evopo.com', 'explodemail.com', 'fakeinformation.com', 'fakemailz.com', 'fammix.com',
  'fansworldwide.de', 'fantasymail.de', 'fightallspam.com', 'filzmail.com', 'fivemail.de',
  'fleckens.hu', 'fls-dubai.com', 'flyspam.com', 'footard.com', 'forgetmail.com', 'fr33mail.info',
  'frapmail.com', 'freeanonymousemail.com', 'freegishmail.com', 'freemails.cf', 'freemails.ga',
  'freemails.ml', 'freundin.ru', 'friendlymail.co.uk', 'front14.org', 'fuckingduh.com',
  'fudgerub.com', 'fux0ringduh.com', 'garbagemail.org', 'get1mail.com', 'get2mail.fr',
  'getairmail.com', 'getmails.eu', 'getonemail.com', 'getonemail.net', 'ghosttemail.com',
  'giantmail.de', 'girlsundertheinfluence.com', 'gishpuppy.com', 'gowikibooks.com',
  'gowikicampus.com', 'gowikifilms.com', 'gowikigames.com', 'gowikimusic.com', 'gowikinetwork.com',
  'gowikitravel.com', 'gowikitv.com', 'grandmamail.com', 'grandmasmail.com', 'great-host.in',
  'greensloth.com', 'grr.la', 'gsrv.co.uk', 'guerillamail.biz', 'guerillamail.com', 'guerillamail.de',
  'guerillamail.net', 'guerillamail.org', 'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de',
  'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'gustr.com', 'harakirimail.com', 'hat-geld.de', 'hatespam.org', 'herp.in', 'hidemail.de',
  'hidzz.com', 'hmamail.com', 'hopemail.biz', 'hotpop.com', 'hulapla.de', 'ieatspam.eu',
  'ieatspam.info', 'ieh-mail.de', 'ikbenspamvrij.nl', 'imails.info', 'inboxalias.com',
  'inboxclean.com', 'inboxclean.org', 'incognitomail.com', 'incognitomail.net', 'incognitomail.org',
  'insorg-mail.info', 'instant-mail.de', 'ip6.li', 'irish2me.com', 'iwi.net', 'jetable.com',
  'jetable.fr.nf', 'jetable.net', 'jetable.org', 'junk1e.com', 'kaspop.com', 'keepmymail.com',
  'killmail.com', 'killmail.net', 'klzlk.com', 'koszmail.pl', 'kurzepost.de', 'l33r.eu',
  'lawlita.com', 'letthemeatspam.com', 'lhsdv.com', 'lifebyfood.com', 'link2mail.net',
  'litedrop.com', 'lol.ovpn.to', 'lolfreak.net', 'lookugly.com', 'lopl.co.cc', 'lortemail.dk',
  'lr78.com', 'lroid.com', 'lukop.dk', 'm21.cc', 'mail.by', 'mail.mezimages.net', 'mail.zp.ua',
  'mail1a.de', 'mail21.cc', 'mail2rss.org', 'mail333.com', 'mail4trash.com', 'mailbidon.com',
  'mailbiz.biz', 'mailblocks.com', 'mailbucket.org', 'mailcat.biz', 'mailcatch.com', 'mailde.de',
  'mailde.info', 'maildrop.cc', 'maildx.com', 'maileater.com', 'mailexpire.com', 'mailfa.tk',
  'mailforspam.com', 'mailfreeonline.com', 'mailguard.me', 'mailin8r.com', 'mailinater.com',
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailincubator.com', 'mailismagic.com',
  'mailme.lv', 'mailmetrash.com', 'mailmoat.com', 'mailms.com', 'mailnesia.com', 'mailnull.com',
  'mailorg.org', 'mailpick.biz', 'mailrock.biz', 'mailscrap.com', 'mailshell.com', 'mailsiphon.com',
  'mailtemp.info', 'mailtome.de', 'mailtothis.com', 'mailtrash.net', 'mailtv.net', 'mailtv.tv',
  'mailzilla.com', 'mailzilla.org', 'makemetheking.com', 'manybrain.com', 'mbx.cc', 'mciek.com',
  'mega.zik.dj', 'meinspamschutz.de', 'meltmail.com', 'messagebeamer.de', 'mezimages.net',
  'mierdamail.com', 'migmail.pl', 'mintemail.com', 'mjukglass.nu', 'mobi.web.id', 'moburl.com',
  'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'monumentmail.com', 'mt2009.com',
  'mt2014.com', 'mycard.net.ua', 'mycleaninbox.net', 'mymail-in.net', 'mypacks.net', 'mypartyclip.de',
  'myphantomemail.com', 'myspaceinc.com', 'myspaceinc.net', 'myspaceinc.org', 'myspacepimpedup.com',
  'myspamless.com', 'mytrashmail.com', 'n1nja.org', 'neverbox.com', 'no-spam.ws', 'nobugmail.com',
  'nobulk.com', 'noclickemail.com', 'nogmailspam.info', 'nomail.xl.cx', 'nomail2me.com',
  'nomorespamemails.com', 'nospam.ze.tc', 'nospam4.us', 'nospamfor.us', 'nospammail.net',
  'nospamthanks.info', 'notmailinator.com', 'nowmymail.com', 'nurfuerspam.de',
  'nwldx.com', 'objectmail.com', 'obobbo.com', 'odnorazovoe.ru', 'one-time.email', 'onewaymail.com',
  'online.ms', 'oopi.org', 'opayq.com', 'ordinaryamerican.net', 'otherinbox.com', 'ovpn.to',
  'owlpic.com', 'pancakemail.com', 'paq.ru', 'pcusers.otherinbox.com', 'pjkiszka.nr.pl',
  'plexolan.de', 'poczta.onet.pl', 'politikerclub.de', 'pooae.com', 'pookmail.com', 'postacin.com',
  'privacy.net', 'privy-mail.com', 'privymail.de', 'proxymail.eu', 'prtnx.com', 'put2.net',
  'putthisinyourspamdatabase.com', 'pwrby.com', 'quickinbox.com', 'rcpt.at', 'reallymymail.com',
  'realtyalerts.ca', 'recode.me', 'reconmail.com', 'recursor.net', 'recyclebin.jp', 'redfeathercrow.com',
  'regbypass.com', 'regbypass.comsafe-mail.net', 'rejectmail.com', 'reliable-mail.com', 'rhyta.com',
  'rklips.com', 'rmqkr.net', 'royal.net', 'rppkn.com', 'rtrtr.com', 'rudymail.com', 's0ny.net',
  'safe-mail.net', 'safersignup.de', 'safetymail.info', 'safetypost.de', 'sandelf.de', 'saynotospams.com',
  'schafmail.de', 'selfdestructingmail.com', 'sendspamhere.de', 'sharklasers.com', 'shiftmail.com',
  'shitmail.me', 'shitware.nl', 'shmeriously.com', 'shortmail.net', 'sibmail.com', 'sinnlos-mail.de',
  'siteposter.net', 'skeefmail.com', 'slopsbox.com', 'slushmail.com', 'smashmail.de', 'smellfear.com',
  'snakemail.com', 'sneakemail.com', 'snkmail.com', 'sofimail.com', 'sofort-mail.de', 'sogetthis.com',
  'soodonims.com', 'spam.la', 'spam.su', 'spam4.me', 'spamavert.com', 'spambob.com', 'spambob.net',
  'spambob.org', 'spambog.com', 'spambog.de', 'spambog.net', 'spambog.ru', 'spambox.info',
  'spambox.irishspringtours.com', 'spambox.us', 'spamcannon.com', 'spamcannon.net', 'spamcero.com',
  'spamcon.org', 'spamcorptastic.com', 'spamcowboy.com', 'spamcowboy.net', 'spamcowboy.org',
  'spamday.com', 'spamex.com', 'spamfree24.com', 'spamfree24.de', 'spamfree24.eu', 'spamfree24.net',
  'spamfree24.org', 'spamgoes.com', 'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'spamherelots.com', 'spamhereplease.com', 'spamhole.com', 'spami.spam.co.za', 'spamify.com',
  'spaminator.de', 'spamkill.info', 'spaml.com', 'spaml.de', 'spammotel.com', 'spamobox.com',
  'spamoff.de', 'spamslicer.com', 'spamspot.com', 'spamstack.net', 'spamthis.co.uk', 'spamthisplease.com',
  'spamtrail.com', 'spamtroll.net', 'speed.1s.fr', 'srilankahotel.com', 'ssoia.com', 'startkeys.com',
  'stinkefinger.net', 'stop-my-spam.com', 'stuffmail.de', 'super-auswahl.de', 'supergreatmail.com',
  'supermailer.jp', 'superrito.com', 'superstachel.de', 'suremail.info', 'sweetxxx.de', 'talkinator.com',
  'teewars.org', 'teleworm.com', 'teleworm.us', 'temp-mail.org', 'temp-mail.ru', 'tempalias.com',
  'tempe-mail.com', 'tempemail.biz', 'tempemail.com', 'tempinbox.co.uk', 'tempinbox.com', 'tempmail.eu',
  'tempmail2.com', 'tempmaildemo.com', 'tempmailer.com', 'tempmailer.de', 'tempomail.fr', 'temporarily.de',
  'temporarioemail.com.br', 'temporaryemail.net', 'temporaryforwarding.com', 'temporaryinbox.com',
  'temporarymailaddress.com', 'tempthe.net', 'thankyou2010.com', 'thc.st', 'thedogs.ws', 'thisisnotmyrealemail.com',
  'thismail.net', 'throwawayemailaddresses.com', 'tilien.com', 'tittbit.in', 'tmail.ws', 'tmailinator.com',
  'toiea.com', 'toomail.biz', 'topranklist.de', 'tradermail.info', 'trash-amil.com', 'trash-mail.at',
  'trash-mail.com', 'trash-mail.de', 'trash2009.com', 'trash2010.com', 'trash2011.com', 'trashdevil.com',
  'trashdevil.de', 'trashemail.de', 'trashmail.at', 'trashmail.com', 'trashmail.de', 'trashmail.me',
  'trashmail.net', 'trashmail.org', 'trashmail.ws', 'trashmailer.com', 'trashymail.com', 'trillianpro.com',
  'turual.com', 'twinmail.de', 'tyldd.com', 'uggsrock.com', 'umail.net', 'uroid.com', 'us.af',
  'venompen.com', 'veryrealemail.com', 'vidchart.com', 'viditag.com', 'viewcastmedia.com', 'viewcastmedia.net',
  'viewcastmedia.org', 'vomoto.com', 'vpn.st', 'vsimcard.com', 'vubby.com', 'walala.org', 'walkmail.net',
  'webemail.me', 'weg-werf-email.de', 'wegwerf-email-addressen.de', 'wegwerf-emails.de', 'wegwerfadresse.de',
  'wegwerfemail.com', 'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.info', 'wegwerfmail.net',
  'wegwerfmail.org', 'wh4f.org', 'whatiaas.com', 'whatpaulus.com', 'whyspam.me', 'willhackforfood.biz',
  'willselldrugs.com', 'winemaven.info', 'wronghead.com', 'wuzup.net', 'wuzupmail.net', 'www.e4ward.com',
  'www.gishpuppy.com', 'www.mailinator.com', 'wwwnew.eu', 'x.ip6.li', 'xents.com', 'xmaily.com',
  'xoxy.net', 'yep.it', 'yogamaven.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'yourdomain.com',
  'yourmailaddress.com', 'ypmail.webredirect.org', 'yuurok.com', 'zehnminutenmail.de', 'zetmail.com',
  'zippymail.info', 'zoaxe.com', 'zoemail.org', 'zomg.info'
]);

/**
 * Validates if an email domain is from a legitimate provider
 */
export function isLegitimateEmailDomain(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  
  // First check if it's a known legitimate domain
  if (LEGITIMATE_EMAIL_DOMAINS.has(domain)) {
    return true;
  }
  
  // Check for educational institutions (.edu domains)
  if (domain.endsWith('.edu') || domain.includes('.edu.')) {
    return true;
  }
  
  // Check for government domains
  if (domain.endsWith('.gov') || domain.endsWith('.mil')) {
    return true;
  }
  
  return false;
}

/**
 * Checks if an email domain is from a known disposable email provider
 */
export function isDisposableEmailDomain(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * Validates email legitimacy with detailed feedback
 */
export function validateEmailLegitimacy(email: string): {
  isValid: boolean;
  reason?: string;
  suggestion?: string;
} {
  const domain = email.toLowerCase().split('@')[1];
  
  if (!domain) {
    return {
      isValid: false,
      reason: "Invalid email format",
      suggestion: "Please enter a valid email address"
    };
  }
  
  // Check for disposable emails (most restrictive)
  if (isDisposableEmailDomain(email)) {
    return {
      isValid: false,
      reason: "Temporary email addresses are not allowed",
      suggestion: "Please use a permanent email address from a major provider like Gmail, Yahoo, or Outlook"
    };
  }
  
  // Accept all other domains (including corporate, unknown, etc.)
  // This balances legitimacy with user friction by only blocking known bad actors
  return { isValid: true };
}

/**
 * Zod validator for legitimate emails
 */
export const legitimateEmailValidator = z.string()
  .transform(email => email.trim().toLowerCase())
  .pipe(
    z.string()
      .email("Please enter a valid email address")
      .refine((email) => {
        const validation = validateEmailLegitimacy(email);
        return validation.isValid;
      }, (email) => {
        const validation = validateEmailLegitimacy(email);
        const message = validation.reason || "Please use a legitimate email address";
        const suggestion = validation.suggestion ? ` — ${validation.suggestion}` : "";
        return { message: message + suggestion };
      })
  );