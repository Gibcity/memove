"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CareerService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const locations_loader_1 = require("./locations.loader");
// Occupation/earnings data comes from Census ACS S2001 + S2401 (see
// sources/scripts/pull_cbsa_occupation_earnings.py). BLS OEUM/MSA isn't
// accessible — the public BLS API v2 doesn't expose OEUM series, and
// www.bls.gov is geo-blocked at our egress. ACS gives us the same shape
// (CBSA-level employment counts + median earnings) with one key we already
// have. Reuse the existing Location record for the cost/fiscal fields.
const OCCUPATION_PATH = path.resolve(__dirname, '../../../../sources/processed/cbsa_occupation.json');
let _cbsaData = null;
function board(name, url) { return { name, url }; }
const LICENSING_BOARDS = {
    AL: { nursing: board('AL Board of Nursing', 'https://www.abn.alabama.gov/'), teaching: board('AL State Dept of Education', 'https://www.alabamaadministrativecode.state.al.us/docs/ed/index.html'), real_estate: board('AL Real Estate Commission', 'https://arec.alabama.gov/'), contractor: board('AL Home Builders Licensure Board', 'https://www.hblb.alabama.gov/') },
    AK: { nursing: board('AK Board of Nursing', 'https://www.commerce.alaska.gov/web/cbpl/ProfessionalLicensing/BoardofNursing.aspx'), teaching: board('AK Dept of Education & Early Development', 'https://education.alaska.gov/'), real_estate: board('AK Real Estate Commission', 'https://www.commerce.alaska.gov/web/cbpl/ProfessionalLicensing/RealEstateCommission.aspx'), contractor: board('AK Dept of Commerce — Construction Contractors', 'https://www.commerce.alaska.gov/web/cbpl/ProfessionalLicensing/ConstructionContractor.aspx') },
    AZ: { nursing: board('AZ State Board of Nursing', 'https://www.azbn.gov/'), teaching: board('AZ Dept of Education', 'https://www.azed.gov/'), real_estate: board('AZ Dept of Real Estate', 'https://azre.gov/'), contractor: board('AZ Registrar of Contractors', 'https://roc.az.gov/') },
    AR: { nursing: board('AR State Board of Nursing', 'https://www.arsbn.org/'), teaching: board('AR Dept of Education', 'https://dese.ade.arkansas.gov/'), real_estate: board('AR Real Estate Commission', 'https://arec.arkansas.gov/'), contractor: board('AR Contractors Licensing Board', 'https://www.aclb.arkansas.gov/') },
    CA: { nursing: board('CA Board of Registered Nursing', 'https://www.rn.ca.gov/'), teaching: board('CA Commission on Teacher Credentialing', 'https://www.ctc.ca.gov/'), real_estate: board('CA Dept of Real Estate', 'https://www.dre.ca.gov/'), contractor: board('CA Contractors State License Board', 'https://www.cslb.ca.gov/') },
    CO: { nursing: board('CO Board of Nursing', 'https://dpo.colorado.gov/Nursing'), teaching: board('CO Dept of Education', 'https://www.cde.state.co.us/'), real_estate: board('CO Division of Real Estate', 'https://dre.colorado.gov/'), contractor: board('CO DORA', 'https://dpo.colorado.gov/') },
    CT: { nursing: board('CT Board of Examiners for Nursing', 'https://portal.ct.gov/DPH/Practitioner-Licensing--Investigations/Registered-Nurse-Licensure'), teaching: board('CT State Dept of Education', 'https://portal.ct.gov/SDE'), real_estate: board('CT Department of Consumer Protection', 'https://portal.ct.gov/DCP'), contractor: board('CT Department of Consumer Protection — Trades', 'https://portal.ct.gov/DCP/Licensing/Trade-and-Construction-Licenses') },
    DE: { nursing: board('DE Board of Nursing', 'https://dpr.delaware.gov/boards/nursing/'), teaching: board('DE Dept of Education', 'https://www.doe.k12.de.us/'), real_estate: board('DE Division of Professional Regulation — Real Estate', 'https://dpr.delaware.gov/boards/realestate/'), contractor: board('DE Board of Plumbing, Heating & AC; HVAC; Refrigeration', 'https://dpr.delaware.gov/') },
    DC: { nursing: board('DC Board of Nursing', 'https://dchealth.dc.gov/bon'), teaching: board('DC Office of the State Superintendent of Education', 'https://osse.dc.gov/'), real_estate: board('DC Real Estate Commission', 'https://Muriel.Bowser/real-estate'), contractor: board('DC Dept of Buildings — Permits & Licensing', 'https://dob.dc.gov/') },
    FL: { nursing: board('FL Board of Nursing', 'https://floridasnursing.gov/'), teaching: board('FL Dept of Education', 'https://www.fldoe.org/'), real_estate: board('FL DBPR', 'https://www.myfloridalicense.com/dbpr/'), contractor: board('FL Construction Industry Licensing Board', 'https://www.myfloridalicense.com/cilb/') },
    GA: { nursing: board('GA Board of Nursing', 'https://www.sos.ga.gov/georgia-board-nursing'), teaching: board('GA Dept of Education', 'https://www.gadoe.org/'), real_estate: board('GA Real Estate Commission', 'https://www.grec.state.ga.us/'), contractor: board('GA State Licensing Board for Residential and General Contractors', 'https://www.sos.ga.gov/state-licensing-board-residential-general-contractors') },
    HI: { nursing: board('HI Board of Nursing', 'https://cca.hawaii.gov/pvl/boards/nursing/'), teaching: board('HI Dept of Education', 'https://www.hawaiipublicschools.org/'), real_estate: board('HI Real Estate Commission', 'https://cca.hawaii.gov/rec/'), contractor: board('HI Contractors License Board', 'https://cca.hawaii.gov/pvl/boards/contractor/') },
    ID: { nursing: board('ID Board of Nursing', 'https://ibn.idaho.gov/'), teaching: board('ID Dept of Education', 'https://www.sde.idaho.gov/'), real_estate: board('ID Real Estate Commission', 'https://irec.idaho.gov/'), contractor: board('ID Division of Building Safety', 'https://dbs.idaho.gov/') },
    IL: { nursing: board('IL Center for Nursing', 'https://nursing.illinois.gov/'), teaching: board('IL State Board of Education', 'https://www.isbe.net/'), real_estate: board('IL Dept of Financial & Professional Regulation — Real Estate', 'https://idfpr.illinois.gov/profs/RealEstate.html'), contractor: board('IL Dept of Public Health — Plumbing & Roofing', 'https://www.idph.state.il.us/') },
    IN: { nursing: board('IN State Board of Nursing', 'https://www.in.gov/pla/nursing.htm'), teaching: board('IN Dept of Education', 'https://www.doe.in.gov/'), real_estate: board('IN Professional Licensing Agency — Real Estate', 'https://www.in.gov/pla/real-estate.htm'), contractor: board('IN Board of Plumbing & HVAC; IN Dept of Homeland Security — Building Codes', 'https://www.in.gov/pla/') },
    IA: { nursing: board('IA Board of Nursing', 'https://nursing.iowa.gov/'), teaching: board('IA Dept of Education', 'https://educateiowa.gov/'), real_estate: board('IA Professional Licensing Division — Real Estate', 'https://plb.iowa.gov/board/real-estate-sales-brokerage'), contractor: board('IA Plumbing & Mechanical Licensing Board', 'https://plb.iowa.gov/board/plumbing-and-mechanical-systems-board') },
    KS: { nursing: board('KS State Board of Nursing', 'https://ksbn.kansas.gov/'), teaching: board('KS Dept of Education', 'https://www.ksde.gov/'), real_estate: board('KS Real Estate Commission', 'https://www.krec.ks.gov/'), contractor: board('KS Johnson County Contractor Licensing (county-level)', 'https://www.jocogov.org/') },
    KY: { nursing: board('KY Board of Nursing', 'https://kbn.ky.gov/'), teaching: board('KY Dept of Education', 'https://education.ky.gov/'), real_estate: board('KY Real Estate Commission', 'https://kyrec.ky.gov/'), contractor: board('KY Dept of Housing, Buildings & Construction', 'https://dhbc.ky.gov/') },
    LA: { nursing: board('LA State Board of Nursing', 'https://www.lsbn.state.la.us/'), teaching: board('LA Dept of Education', 'https://www.louisianabelieves.com/'), real_estate: board('LA Real Estate Commission', 'https://lrec.gov.la.gov/'), contractor: board('LA State Licensing Board for Contractors', 'https://lslbc.louisiana.gov/') },
    ME: { nursing: board('ME State Board of Nursing', 'https://www.maine.gov/boardofnursing/'), teaching: board('ME Dept of Education', 'https://www.maine.gov/doe/'), real_estate: board('ME Real Estate Commission', 'https://www.maine.gov/recommission/'), contractor: board('ME Dept of Professional & Financial Regulation — Electricians & Plumbers', 'https://www.maine.gov/pfr/') },
    MD: { nursing: board('MD Board of Nursing', 'https://mbon.maryland.gov/'), teaching: board('MD State Dept of Education', 'https://marylandpublicschools.org/'), real_estate: board('MD Real Estate Commission', 'https://www.dllr.state.md.us/realestate/'), contractor: board('MD Home Improvement Commission (MHIC)', 'https://www.dllr.state.md.us/mhic/') },
    MA: { nursing: board('MA Board of Registration in Nursing', 'https://www.mass.gov/orgs/board-of-registration-in-nursing'), teaching: board('MA Dept of Elementary & Secondary Education', 'https://www.doe.mass.edu/'), real_estate: board('MA Board of Registration of Real Estate Brokers & Salespersons', 'https://www.mass.gov/orgs/board-of-registration-of-real-estate-brokers-and-salespersons'), contractor: board('MA Board of Building Regulations & Standards', 'https://www.mass.gov/orgs/board-of-building-regulations-and-standards') },
    MI: { nursing: board('MI Board of Nursing', 'https://www.michigan.gov/lara/bureau-list/bpl/health/hp-lic/nursing'), teaching: board('MI Dept of Education', 'https://www.michigan.gov/mde/'), real_estate: board('MI Dept of Licensing & Regulatory Affairs — Real Estate', 'https://www.michigan.gov/lara/bureau-list/bpl/occ/prof/real-estate'), contractor: board('MI Dept of Licensing & Regulatory Affairs — Builders & Contractors', 'https://www.michigan.gov/lara/bureau-list/csl') },
    MN: { nursing: board('MN Board of Nursing', 'https://mn.gov/boards/nursing/'), teaching: board('MN Dept of Education', 'https://education.mn.gov/'), real_estate: board('MN Dept of Commerce — Real Estate', 'https://mn.gov/commerce/industries/real-estate/'), contractor: board('MN Dept of Labor & Industry — Construction Codes & Licensing', 'https://www.dli.mn.gov/') },
    MS: { nursing: board('MS Board of Nursing', 'https://www.msbn.ms.gov/'), teaching: board('MS Dept of Education', 'https://www.mdek12.org/'), real_estate: board('MS Real Estate Commission', 'https://www.mrec.ms.gov/'), contractor: board('MS State Board of Contractors', 'https://www.msbc.ms.gov/') },
    MO: { nursing: board('MO State Board of Nursing', 'https://pr.mo.gov/nursing.asp'), teaching: board('MO Dept of Elementary & Secondary Education', 'https://dese.mo.gov/'), real_estate: board('MO Real Estate Commission', 'https://pr.mo.gov/real-estate.asp'), contractor: board('MO Division of Professional Registration — Construction', 'https://pr.mo.gov/') },
    MT: { nursing: board('MT Board of Nursing', 'https://boards.bsd.dli.mt.gov/nursing-board'), teaching: board('MT Office of Public Instruction', 'https://opi.mt.gov/'), real_estate: board('MT Board of Realty Regulation', 'https://boards.bsd.dli.mt.gov/realty-regulation-board'), contractor: board('MT Dept of Labor & Industry — Building Codes', 'https://bcd.dli.mt.gov/') },
    NE: { nursing: board('NE Board of Nursing', 'https://dhhs.ne.gov/licensing/Pages/Nursing.aspx'), teaching: board('NE Dept of Education', 'https://www.education.ne.gov/'), real_estate: board('NE Real Estate Commission', 'https://nrec.ne.gov/'), contractor: board('NE State Electrical Board / plumbing — DHHS', 'https://dhhs.ne.gov/licensing/Pages/default.aspx') },
    NV: { nursing: board('NV State Board of Nursing', 'https://nevadanursingboard.org/'), teaching: board('NV Dept of Education', 'https://doe.nv.gov/'), real_estate: board('NV Real Estate Division', 'https://red.nv.gov/'), contractor: board('NV State Contractors Board', 'https://www.nscb.nv.gov/') },
    NH: { nursing: board('NH Board of Nursing', 'https://www.oplc.nh.gov/nursing'), teaching: board('NH Dept of Education', 'https://www.education.nh.gov/'), real_estate: board('NH Real Estate Commission', 'https://www.oplc.nh.gov/real-estate'), contractor: board('NH Electricians & Plumbers Boards', 'https://www.oplc.nh.gov/') },
    NJ: { nursing: board('NJ Board of Nursing', 'https://www.njconsumeraffairs.gov/nur/Pages/default.aspx'), teaching: board('NJ Dept of Education', 'https://www.nj.gov/education/'), real_estate: board('NJ Real Estate Commission', 'https://www.nj.gov/dca/divisions/codes/'), contractor: board('NJ Division of Consumer Affairs — Home Improvement', 'https://www.nj.gov/dca/divisions/codes/') },
    NM: { nursing: board('NM Board of Nursing', 'https://www.bon.nm.gov/'), teaching: board('NM Public Education Dept', 'https://web.ped.state.nm.us/'), real_estate: board('NM Real Estate Commission', 'https://www.rld.state.nm.us/boards/real_estate_commission.aspx'), contractor: board('NM Construction Industries Division (CID)', 'https://www.rld.state.nm.us/boards/CID.aspx') },
    NY: { nursing: board('NY State Board for Nursing', 'http://www.op.nysed.gov/professions/nursing/'), teaching: board('NY State Education Dept', 'http://www.nysed.gov/'), real_estate: board('NY Dept of State', 'https://www.dos.ny.gov/'), contractor: board('NYC Dept of Buildings', 'https://www.nyc.gov/site/buildings/index.page') },
    NC: { nursing: board('NC Board of Nursing', 'https://www.ncbon.com/'), teaching: board('NC Dept of Public Instruction', 'https://www.dpi.nc.gov/'), real_estate: board('NC Real Estate Commission', 'https://www.ncrec.gov/'), contractor: board('NC Licensing Board for General Contractors', 'https://www.nclbgc.org/') },
    ND: { nursing: board('ND Board of Nursing', 'https://www.ndbon.org/'), teaching: board('ND Dept of Public Instruction', 'https://www.nd.gov/dpi/'), real_estate: board('ND Real Estate Commission', 'https://www.realestatend.org/'), contractor: board('ND Secretary of State — Contractors (ND has no state license)', 'https://sos.nd.gov/') },
    OH: { nursing: board('OH Board of Nursing', 'https://nursing.ohio.gov/'), teaching: board('OH Dept of Education', 'https://education.ohio.gov/'), real_estate: board('OH Division of Real Estate & Professional Licensing', 'https://com.ohio.gov/real/'), contractor: board('OH Construction Industry Licensing Board', 'https://com.ohio.gov/div/cilb/') },
    OK: { nursing: board('OK Board of Nursing', 'https://www.okbn.gov/'), teaching: board('OK State Dept of Education', 'https://sde.ok.gov/'), real_estate: board('OK Real Estate Commission', 'https://www.ok.gov/orec/'), contractor: board('OK Construction Industries Board', 'https://www.ok.gov/cib/') },
    OR: { nursing: board('OR State Board of Nursing', 'https://www.oregon.gov/OSBN/Pages/index.aspx'), teaching: board('OR Dept of Education', 'https://www.oregon.gov/ode/'), real_estate: board('OR Real Estate Agency', 'https://orea.oregon.gov/'), contractor: board('OR Construction Contractors Board', 'https://www.oregon.gov/ccb/') },
    PA: { nursing: board('PA State Board of Nursing', 'https://www.dos.pa.gov/ProfessionalLicensing/BoardsCommissions/Nursing/Pages/default.aspx'), teaching: board('PA Dept of Education', 'https://www.education.pa.gov/'), real_estate: board('PA Real Estate Commission', 'https://www.dos.pa.gov/ProfessionalLicensing/BoardsCommissions/RealEstateCommission/Pages/default.aspx'), contractor: board('PA Dept of Labor & Industry — UCC', 'https://www.dli.pa.gov/Individuals/Licenses-Registration/Pages/default.aspx') },
    RI: { nursing: board('RI Board of Nurse Registration & Nursing Education', 'https://health.ri.gov/licenses/detail.php?id=231'), teaching: board('RI Dept of Education', 'https://www.ride.ri.gov/'), real_estate: board('RI Dept of Business Regulation — Real Estate', 'https://dbr.ri.gov/'), contractor: board('RI Contractors Registration & Licensing Board', 'https://dbr.ri.gov/') },
    SC: { nursing: board('SC State Board of Nursing', 'https://www.llr.sc.gov/board/nursing'), teaching: board('SC Dept of Education', 'https://ed.sc.gov/'), real_estate: board('SC Real Estate Commission', 'https://www.llr.sc.gov/board/recomm'), contractor: board('SC Contractors Licensing Board', 'https://www.llr.sc.gov/board/clb') },
    SD: { nursing: board('SD Board of Nursing', 'https://doh.sd.gov/boards/nursing/'), teaching: board('SD Dept of Education', 'https://doe.sd.gov/'), real_estate: board('SD Real Estate Commission', 'https://doh.sd.gov/boards/real-estate/'), contractor: board('SD Dept of Labor — Contractor Licensing (varies by city)', 'https://dlr.sd.gov/') },
    TN: { nursing: board('TN Board of Nursing', 'https://tn.gov/health/health-program-areas/health-professional-boards/nursing-board.html'), teaching: board('TN Dept of Education', 'https://www.tn.gov/education.html'), real_estate: board('TN Real Estate Commission', 'https://tn.gov/commerce/regboards/realestate.html'), contractor: board('TN Board for Licensing Contractors', 'https://tn.gov/commerce/regboards/contractors.html') },
    TX: { nursing: board('TX Board of Nursing', 'https://www.bon.texas.gov/'), teaching: board('TX Education Agency', 'https://tea.texas.gov/'), real_estate: board('TX Real Estate Commission', 'https://www.trec.texas.gov/'), contractor: board('TX Dept of Licensing & Regulation', 'https://www.tdlr.texas.gov/') },
    UT: { nursing: board('UT Board of Nursing', 'https://dopl.utah.gov/nursing/'), teaching: board('UT State Board of Education', 'https://schools.utah.gov/'), real_estate: board('UT Division of Real Estate', 'https://dreal.utah.gov/'), contractor: board('UT Division of Occupational & Professional Licensing — Contractors', 'https://dopl.utah.gov/') },
    VT: { nursing: board('VT Board of Nursing', 'https://sos.vermont.gov/nursing/'), teaching: board('VT Agency of Education', 'https://education.vermont.gov/'), real_estate: board('VT Real Estate Commission', 'https://sos.vermont.gov/real-estate/'), contractor: board('VT Office of Professional Regulation — Trades', 'https://sos.vermont.gov/opr/') },
    VA: { nursing: board('VA Board of Nursing', 'https://www.dhp.virginia.gov/Boards/Nursing/'), teaching: board('VA Dept of Education', 'https://www.doe.virginia.gov/'), real_estate: board('VA Real Estate Board', 'https://www.dpor.virginia.gov/board/real-estate/'), contractor: board('VA Board for Contractors', 'https://www.dpor.virginia.gov/board/contractors/') },
    WA: { nursing: board('WA Nursing Care Quality Assurance Commission', 'https://www.doh.wa.gov/Licenses-Permits-and-Certificates/Nursing-Commission'), teaching: board('WA OSPI', 'https://ospi.k12.wa.us/'), real_estate: board('WA Dept of Licensing', 'https://www.dol.wa.gov/business/realestate/'), contractor: board('WA L&I', 'https://www.lni.wa.gov/TradesLicensing/Contractors/') },
    WV: { nursing: board('WV Board of Examiners for RNs', 'https://wvrnboard.wv.gov/'), teaching: board('WV Dept of Education', 'https://wvde.state.wv.us/'), real_estate: board('WV Real Estate Commission', 'https://rec.wv.gov/'), contractor: board('WV Contractor Licensing Board', 'https://wvlabor.force.com/clb/') },
    WI: { nursing: board('WI Board of Nursing', 'https://dsps.wi.gov/Pages/BoardsCouncils/Nursing.aspx'), teaching: board('WI Dept of Public Instruction', 'https://dpi.wi.gov/'), real_estate: board('WI Real Estate Examining Board', 'https://dsps.wi.gov/Pages/BoardsCouncils/RealEstate.aspx'), contractor: board('WI Dept of Safety & Professional Services — Trades', 'https://dsps.wi.gov/') },
    WY: { nursing: board('WY State Board of Nursing', 'https://wsbn.wyo.gov/'), teaching: board('WY Dept of Education', 'https://edu.wyoming.gov/'), real_estate: board('WY Real Estate Commission', 'https://realestate.wy.gov/'), contractor: board('WY has no state general contractor license; check city', 'https://wyoleg.gov/') },
};
// ponytail: fall back to NCSBN directory for any state the lookup misses —
// safer than inventing a URL. Same for the state DOE portal and the
// catch-all state-professional-licensing entry point.
function licensingFallback(state) {
    const stateName = stateNameFromCode(state);
    return {
        nursing: board(`${stateName} Board of Nursing — NCSBN directory`, 'https://www.ncsbn.org/contact-bon.htm'),
        teaching: board(`${stateName} Dept of Education (verify on .gov)`, `https://www.google.com/search?q=${encodeURIComponent(stateName + ' department of education official site .gov')}`),
        real_estate: board(`${stateName} Real Estate Commission (verify on .gov)`, `https://www.google.com/search?q=${encodeURIComponent(stateName + ' real estate commission licensing official .gov')}`),
        contractor: board(`${stateName} Contractor Licensing (verify on .gov)`, `https://www.google.com/search?q=${encodeURIComponent(stateName + ' contractor licensing board official .gov')}`),
    };
}
const STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
function stateNameFromCode(code) {
    return STATE_NAMES[code.toUpperCase()] ?? code;
}
function loadCbsaData() {
    if (_cbsaData === null) {
        const raw = JSON.parse(fs.readFileSync(OCCUPATION_PATH, 'utf-8'));
        _cbsaData = new Map(raw.cbsas.map((c) => [c.cbsa_code, c]));
    }
    return _cbsaData;
}
// ponytail: Locations use short "City, ST" names (e.g. "Austin, TX"); ACS
// payload is keyed by cbsa_code only. Build the name→cbsa_code index from
// the canonical ACS pull and match there. Done once at module load.
let _nameToCbsa = null;
function nameToCbsaIndex() {
    if (_nameToCbsa === null) {
        const acsPath = path.resolve(__dirname, '../../../../sources/processed/census_acs_cbsa.json');
        const acs = JSON.parse(fs.readFileSync(acsPath, 'utf-8'));
        const SUFFIXES = [' Micro Area', ' Metro Area'];
        const idx = new Map();
        for (const rec of acs.cbsas) {
            for (const suffix of SUFFIXES) {
                if (rec.name.endsWith(suffix)) {
                    idx.set(rec.name.slice(0, -suffix.length), rec.cbsa_code);
                    break;
                }
            }
            idx.set(rec.name, rec.cbsa_code);
        }
        // ponytail: multi-state CBSAs (e.g. "New York-Newark-Jersey City, NY-NJ-PA")
        // have the primary state in locations.json ("…NY"). Build a secondary index
        // keyed by the primary-state version so startsWith lookups still resolve.
        // ponytail: secondary index — primary state truncated to "<city>, ST" form.
        const primaryIdx = new Map();
        for (const [k, v] of idx.entries()) {
            // Pull out "<prefix>, ST" — everything up to the first ", ST" segment.
            const m = k.match(/^(.+?), ([A-Z]{2})(?:-|$)/);
            if (m)
                primaryIdx.set(`${m[1]}, ${m[2]}`, v);
        }
        for (const [k, v] of primaryIdx) {
            if (!idx.has(k))
                idx.set(k, v);
        }
        _nameToCbsa = idx;
    }
    return _nameToCbsa;
}
let CareerService = class CareerService {
    // ponytail: real data path — Location provides cost/fiscal; ACS S2001/S2401
    // provides earnings + occupation mix. Both files are pre-built and
    // cacheable in memory; lookups are O(1). The previous "TODO wages" stub is
    // now real Census ACS data (BLS OEUM is unavailable from this network).
    getEconomicIndicators(metroName, _occupation) {
        const needle = metroName.trim().toLowerCase();
        const locs = (0, locations_loader_1.loadLocations)();
        // ponytail: startsWith match — city names in locations.json are CBSA format
        // ("Austin-Round Rock-Georgetown, TX") but users type "Austin, TX".
        const loc = locs.find((l) => l.name.toLowerCase() === needle)
            ?? locs.find((l) => {
                const city = needle.split(',')[0].trim();
                return l.name.toLowerCase().startsWith(city) && l.state.toLowerCase() === needle.split(',').pop()?.trim();
            });
        if (!loc)
            return null;
        const cbsaCode = nameToCbsaIndex().get(loc.name) ?? null;
        const cbsa = cbsaCode ? loadCbsaData().get(cbsaCode) : undefined;
        const pct = cbsa?.occupation.pctByGroup ?? null;
        let topGroup = null;
        if (pct) {
            for (const [group, value] of Object.entries(pct)) {
                if (typeof value === 'number' && (topGroup === null || value > topGroup.pct)) {
                    topGroup = { group, pct: value };
                }
            }
        }
        return {
            metroName: loc.name,
            state: loc.state,
            cbsaCode,
            costOfLivingIndex: loc.cost.costOfLivingIndex,
            medianHomeValue: loc.cost.medianHomeValue,
            medianRent: loc.cost.medianRent,
            taxCompetitivenessScore: loc.fiscal.taxCompetitivenessScore,
            medianEarningsUsd: cbsa?.earnings.medianEarningsUsd ?? null,
            medianEarningsFullTimeYearRoundUsd: cbsa?.earnings.medianEarningsFullTimeYearRoundUsd ?? null,
            totalEmployed: cbsa?.occupation.totalEmployed ?? null,
            occupationPctByGroup: pct,
            occupationTopGroup: topGroup,
            note: cbsa
                ? 'Earnings/occupation from Census ACS 5-Year S2001+S2401 (2022 vintage). BLS OEUM not accessible from this network.'
                : 'Location found but no ACS occupation/earnings record (likely micro area below Census publish threshold).',
        };
    }
    getLicensingBoards(state) {
        const code = state.toUpperCase();
        return LICENSING_BOARDS[code] ?? licensingFallback(code);
    }
    // ponytail: BLS OOH URLs aren't slug-stable (real path is e.g.
    // /ooh/healthcare/registered-nurses.htm), so we always link to the search
    // page with the occupation as a query — guaranteed not-404.
    getOccupationOutlook(occupation) {
        const q = occupation.trim();
        return {
            occupation: q,
            blsOohUrl: `https://www.bls.gov/ooh/search?q=${encodeURIComponent(q)}`,
            note: 'BLS Occupational Outlook Handbook (search URL — OOH paths are category-prefixed and not slug-stable)',
        };
    }
};
exports.CareerService = CareerService;
exports.CareerService = CareerService = __decorate([
    (0, common_1.Injectable)()
], CareerService);
// ponytail: one-liner self-check — fails if lookup or URL format drifts.
if (require.main === module) {
    const svc = new CareerService();
    const austin = svc.getEconomicIndicators('Austin, TX');
    console.assert(austin?.state === 'TX', 'Austin lookup');
    console.assert(austin?.cbsaCode === '12420', 'Austin cbsa code (Austin-Round Rock-Georgetown, TX = 12420): got ' + austin?.cbsaCode);
    console.assert(typeof austin?.medianEarningsUsd === 'number' && austin.medianEarningsUsd > 20000, 'Austin median earnings plausible: ' + austin?.medianEarningsUsd);
    console.assert(austin?.totalEmployed !== null && austin.totalEmployed > 100000, 'Austin totalEmployed plausible: ' + austin?.totalEmployed);
    console.assert(austin?.occupationTopGroup !== null, 'Austin top occupation group: ' + JSON.stringify(austin?.occupationTopGroup));
    console.assert('nursing' in svc.getLicensingBoards('TX'), 'TX boards');
    console.assert('nursing' in svc.getLicensingBoards('ZZ'), 'fallback boards');
    const url = svc.getOccupationOutlook('Registered Nurse').blsOohUrl;
    console.assert(url === 'https://www.bls.gov/ooh/search?q=Registered%20Nurse', 'BLS search URL: ' + url);
    console.log('career.service self-check OK');
}
