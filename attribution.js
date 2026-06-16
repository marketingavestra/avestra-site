/**
 * attribution.js — Avestra UTM Attribution v2
 *
 * Garante que TODA sessão tenha utm_source definido.
 * Prioridade: URL params > sessionStorage > localStorage > auto-detect.
 * Nunca deixa utm_source vazio — fallback mínimo é "direto".
 *
 * Dispara dataLayer.push({ event: 'attribution_ready', ... })
 * GTM lê esse evento e passa para GA4, Meta Pixel e qualquer tag configurada.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'avestra_utms';
  var UTM_KEYS    = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  /* ── helpers ─────────────────────────────────────────── */
  function norm(v) {
    return String(v || '').toLowerCase().trim().replace(/\s+/g, '-');
  }

  function readStorage(storage) {
    try { return JSON.parse(storage.getItem(STORAGE_KEY)) || null; } catch (e) { return null; }
  }

  function writeStorage(storage, data) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  /* ── auto-detect quando não há UTMs na URL ───────────── */
  function detectOrigin() {
    var ua  = (navigator.userAgent || '').toLowerCase();
    var ref = (document.referrer  || '').toLowerCase();

    // In-app browsers (UA é mais confiável que referrer nesses casos)
    if (/instagram/.test(ua))               return mk('instagram',  'social-app',    'inapp-instagram');
    if (/fbav|fban|fbbrowser/.test(ua))     return mk('facebook',   'social-app',    'inapp-facebook');
    if (/whatsapp/.test(ua))                return mk('whatsapp',   'messaging-app', 'inapp-whatsapp');
    if (/tiktok/.test(ua))                  return mk('tiktok',     'social-app',    'inapp-tiktok');
    if (/linkedinapp/.test(ua))             return mk('linkedin',   'social-app',    'inapp-linkedin');

    // Referrer conhecido
    if (/google\.(com|com\.br)/.test(ref))  return mk('google',     'organic',       'busca-organica');
    if (/bing\.com/.test(ref))              return mk('bing',       'organic',       'busca-organica');
    if (/yahoo\.com/.test(ref))             return mk('yahoo',      'organic',       'busca-organica');
    if (/instagram\.com|l\.instagram\.com/.test(ref))
                                            return mk('instagram',  'referral',      'link-bio');
    if (/facebook\.com|fb\.com/.test(ref)) return mk('facebook',   'referral',      'link-perfil');
    if (/youtube\.com/.test(ref))           return mk('youtube',    'referral',      'link-descricao');
    if (/t\.co|twitter\.com|x\.com/.test(ref))
                                            return mk('twitter',    'referral',      'link-perfil');
    if (/linkedin\.com/.test(ref))          return mk('linkedin',   'referral',      'link-perfil');
    if (/tiktok\.com/.test(ref))            return mk('tiktok',     'referral',      'link-bio');

    // Referrer externo genérico
    if (ref && ref.indexOf(window.location.hostname) === -1) {
      var domain = ref.replace(/https?:\/\//, '').split('/')[0].replace('www.', '');
      return mk('referral', 'referral', 'externo', domain);
    }

    // Sem referrer = acesso direto
    return mk('direto', 'none', 'link-direto');
  }

  function mk(source, medium, campaign, content) {
    return {
      utm_source:   source,
      utm_medium:   medium,
      utm_campaign: campaign,
      utm_content:  content || '',
      utm_term:     ''
    };
  }

  /* ── classificação de tipo de tráfego ───────────────── */
  function trafficType(utms) {
    var medium = utms.utm_medium || '';
    if (/^(cpc|ppc|pago|paid|cpm|cpv)$/.test(medium)) return 'pago';
    if (/^(email|e-mail)$/.test(medium))               return 'email';
    if (/^(sms|push)$/.test(medium))                   return 'push';
    if (medium === 'none' && utms.utm_source === 'direto') return 'direto';
    return 'organico';
  }

  /* ── MAIN ────────────────────────────────────────────── */
  var params    = new URLSearchParams(window.location.search);
  var hasUrl    = false;
  var fromUrl   = {};

  UTM_KEYS.forEach(function (k) {
    var v = params.get(k);
    if (v) { fromUrl[k] = norm(v); hasUrl = true; }
  });

  var final;

  if (hasUrl) {
    // Sessão chegou com UTMs na URL — dados confiáveis, persiste tudo
    final = fromUrl;
    writeStorage(sessionStorage, final);
    // localStorage só sobrescreve se era "direto" (não destrói campanha anterior)
    var lsData = readStorage(localStorage);
    if (!lsData || lsData.utm_source === 'direto' || lsData.utm_source === 'desconhecido') {
      writeStorage(localStorage, final);
    }
  } else {
    // Sem UTMs na URL — herda da sessão ou detecta
    var fromSession = readStorage(sessionStorage);
    if (fromSession && fromSession.utm_source) {
      // Mesma aba, navegação interna — mantém atribuição
      final = fromSession;
    } else {
      // Nova sessão sem UTMs — auto-detect
      final = detectOrigin();
      writeStorage(sessionStorage, final);
      var ls = readStorage(localStorage);
      if (!ls || ls.utm_source === 'direto') {
        writeStorage(localStorage, final);
      }
    }
  }

  // Expõe globalmente para que app.js / form handlers incluam nos payloads
  window._avestra_utms = final;

  // Push para GTM — todas as tags GA4 / Meta Pixel recebem esse contexto
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event:        'attribution_ready',
    utm_source:   final.utm_source   || 'desconhecido',
    utm_medium:   final.utm_medium   || 'none',
    utm_campaign: final.utm_campaign || 'sem-campanha',
    utm_content:  final.utm_content  || '',
    utm_term:     final.utm_term     || '',
    traffic_type: trafficType(final)
  });

})();
