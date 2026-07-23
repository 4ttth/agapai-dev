/**
 * Maps a raw eVerify (PhilSys) payload into the full PII record we store
 * encrypted at registration. eVerify field names vary, so each slot tries a
 * list of candidate keys; whatever is present is captured, the rest default to
 * sensible placeholders. The untouched raw payload is kept under `_raw` so no
 * government-provided field is ever lost.
 */

const str = (v) => (v == null ? '' : String(v).trim());

function firstOf(src, keys) {
  for (const k of keys) {
    if (src[k] != null && str(src[k]) !== '') return str(src[k]);
  }
  return '';
}

/**
 * @param raw       the raw eVerify qr/check `data` object
 * @param identity  our normalised identity (from identity.js)
 * @param extra     app-supplied extras (email, gender, blood_type, mobile2…)
 */
export function buildPiiRecord(raw = {}, identity = {}, extra = {}) {
  const g = (keys, fallback = '') => firstOf(raw, keys) || fallback;

  const fullName =
    g(['full_name', 'fullName']) ||
    [identity.firstName, identity.middleName, identity.lastName, identity.suffix]
      .filter(Boolean)
      .join(' ');

  return {
    full_name: fullName,
    first_name: identity.firstName || g(['first_name', 'firstName', 'given_name']),
    middle_name: identity.middleName || g(['middle_name', 'middleName']),
    last_name: identity.lastName || g(['last_name', 'lastName', 'family_name', 'surname']),
    suffix: identity.suffix || g(['suffix', 'name_suffix']),
    gender: str(extra.gender) || identity.gender || g(['gender', 'sex']),
    marital_status: g(['marital_status', 'civil_status'], 'Unknown'),
    blood_type: str(extra.bloodType) || identity.bloodType || g(['blood_type', 'bloodType'], 'Unknown'),
    email: str(extra.email) || g(['email', 'email_address']),
    mobile_number: str(extra.mobile) || identity.mobile || g(['mobile_number', 'mobile', 'phone']),
    birth_date: identity.birthDate || g(['birth_date', 'birthDate', 'date_of_birth', 'dob']),

    full_address: g(['full_address', 'address', 'permanent_address']),
    address_line_1: g(['address_line_1', 'address_line1', 'house_no_street']),
    address_line_2: g(['address_line_2', 'address_line2']),
    barangay: g(['barangay']),
    municipality: g(['municipality', 'city', 'city_municipality']),
    province: g(['province']),
    country: g(['country'], 'Philippines'),
    postal_code: g(['postal_code', 'zip_code', 'zip']),

    present_full_address: g(['present_full_address', 'present_address']),
    present_address_line_1: g(['present_address_line_1', 'present_address_line1']),
    present_address_line_2: g(['present_address_line_2', 'present_address_line2']),
    present_barangay: g(['present_barangay']),
    present_municipality: g(['present_municipality', 'present_city']),
    present_province: g(['present_province']),
    present_country: g(['present_country'], 'Philippines'),
    present_postal_code: g(['present_postal_code', 'present_zip_code']),

    residency_status: g(['residency_status'], 'N/A'),
    place_of_birth: g(['place_of_birth', 'pob']),
    pob_municipality: g(['pob_municipality', 'birth_municipality']),
    pob_province: g(['pob_province', 'birth_province']),
    pob_country: g(['pob_country', 'birth_country'], 'Philippines'),

    // Secondary number the patient optionally added — SMS goes to both.
    mobile_number_2: str(extra.mobile2),

    _raw: raw,
    _capturedAt: new Date().toISOString(),
  };
}
