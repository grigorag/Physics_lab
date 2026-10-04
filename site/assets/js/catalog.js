// ==========================================================================
// Site catalog — the single source of truth for sections and simulations.
// The home page and the header breadcrumbs are generated from this file.
//
// To add a section:    append to `sections` (and give it an accent color in
//                      assets/css/tokens.css → [data-section="…"]).
// To add a simulation: create sims/<section>/<id>/ and append to `sims`.
// ==========================================================================

export const SITE_TITLE = 'Ֆիզիկայի Լաբորատորիաներ';
export const SITE_CREDIT = '«Քվանտ» վարժարան';

export const sections = [
  {
    id: 'mechanics',
    title: 'Մեխանիկա',
    blurb: 'Մարմինների շարժում, հաշվարկման համակարգեր, մեխանիկական ալիքներ',
  },
  {
    id: 'molecular',
    title: 'Մոլեկուլային ֆիզիկա և թերմոդինամիկա',
    blurb: 'Մոլեկուլների ջերմային շարժում, դիֆուզիա',
  },
  {
    id: 'electrodynamics',
    title: 'Էլեկտրադինամիկա',
    blurb: 'Էլեկտրական և մագնիսական դաշտեր, լիցքերի շարժում',
  },
  {
    id: 'optics',
    title: 'Օպտիկա',
    blurb: 'Երկրաչափական և ալիքային օպտիկա',
  },
];

export const sims = [
  // ---- Մեխանիկա ----
  {
    id: 'relative-motion-1d',
    section: 'mechanics',
    title: 'Շարժման հարաբերականություն',
    tag: '1D',
    summary: 'Երկու զատիկ գետնի և շարժվող ժապավենի վրա․ արագությունների գումարում և հանդիպման կետ։',
    path: 'sims/mechanics/relative-motion-1d/',
  },
  {
    id: 'relative-motion-2d',
    section: 'mechanics',
    title: 'Շարժման հարաբերականություն',
    tag: '2D',
    summary: 'Արագությունների գումարումը հարթության վրա՝ զատիկներ և կոնվեյերի ժապավեն։',
    path: 'sims/mechanics/relative-motion-2d/',
  },
  {
    id: 'spring-waves',
    section: 'mechanics',
    title: 'Լայնական և երկայնական ալիքներ',
    summary: 'Ալիքներ զսպանակներով կապված գնդիկների շղթայում, անդրադարձում և կանգուն ալիքներ։',
    path: 'sims/mechanics/spring-waves/',
  },

  // ---- Մոլեկուլային ֆիզիկա և թերմոդինամիկա ----
  {
    id: 'diffusion',
    section: 'molecular',
    title: 'Դիֆուզիա և բրոունյան շարժում',
    summary: 'Մասնիկի քաոսային թափառումը մոլեկուլների հարվածներից և երկու գազերի ինքնաբերական խառնումը։',
    path: 'sims/molecular/diffusion/',
  },

  // ---- Էլեկտրադինամիկա ----
  {
    id: 'charged-particle',
    section: 'electrodynamics',
    title: 'Լիցքավորված մասնիկը մագնիսական դաշտում',
    summary: 'Լորենցի ուժ․ շարժում շրջանագծով և պարուրագծով համասեռ մագնիսական դաշտում (3D)։',
    path: 'sims/electrodynamics/charged-particle/',
  },

  // ---- Օպտիկա ----
  {
    id: 'thin-lens',
    section: 'optics',
    title: 'Բարակ ոսպնյակում պատկերի ստացում',
    summary: 'Պատկերի կառուցումը հավաքող և ցրող ոսպնյակներում, բարակ ոսպնյակի բանաձև։',
    path: 'sims/optics/thin-lens/',
  },
  {
    id: 'wave-optics',
    section: 'optics',
    title: 'Ալիքային օպտիկա',
    summary: 'Ինտերֆերենց, դիֆրակցիա, բևեռացում և դիսպերսիա՝ չորս փորձ մեկ լաբորատորիայում։',
    path: 'sims/optics/wave-optics/',
  },
];

export const getSection = (id) => sections.find((s) => s.id === id);
export const getSim = (id) => sims.find((s) => s.id === id);
export const simsIn = (sectionId) => sims.filter((s) => s.section === sectionId);
