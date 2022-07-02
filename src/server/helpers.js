import { capitalize } from "../bot/utils.js";
import { dateToUtcTimestamp, validateDate } from "../shared/utils/dates.js";
import { formatOrdinal, prettify } from "../shared/utils/strings.js";

/**
 * @typedef {import("handlebars")}
 * @typedef {Handlebars.HelperOptions} HelperOptions
 */

/** @type {(source: unknown) => boolean} */
export const isArr = (source) => Array.isArray(source);

/** @type {(source: unknown) => boolean} */
export const isObj = (source) => !!source && typeof source === "object";

/** @type {(source: unknown) => boolean} */
export const isBool = (source) => typeof source === "boolean";

/** @type {(source: unknown[], sep: string) => string} */
export const join = (source, sep) => source.join(sep);

/** @type {(source: unknown) => boolean} */
export const isURL = (source) => {
    if (typeof source !== "string") return false;
    try {
        /**
         * URL constructor throws TypeError if invalid
         * @see https://nodejs.org/api/url.html#new-urlinput-base
         */
        const url = new URL(source);
        return url.protocol.startsWith("http");
    } catch (error) {
        return false;
    }
};

/** @type {<T>(source: T, init: T) => T} */
export const initIfFalsy = (source, init) => source || init;

/** @type {(a1:unknown, a2:unknown, options:HelperOptions) => unknown} */
export const ifEquals = function (a1, a2, options) {
    return (a1 == a2) ? options.fn(this) : options.inverse(this);
};

/** @type {(a1:unknown, a2:unknown, options:HelperOptions) => unknown} */
export const unlessEquals = function (a1, a2, options) {
    return a1 != a2 ? options.fn(this) : options.inverse(this);
};

/** @type {(value:unknown, options:HelperOptions) => unknown} */
export const ifTruthy = function (value, options) {
    return !!value ? options.fn(this) : options.inverse(this);
};

export const ifNotEmpty = function (value, options) {
    return value > 0 || value.length ? options.fn(this) : options.inverse(this);
};

export const ifCond = function (v1, operator, v2, options) {
    switch (operator) {
        case '==':
            return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=':
            return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==':
            return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<':
            return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=':
            return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>':
            return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=':
            return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&':
            return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||':
            return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
    }
};

/** @type {(m:{ get:(a:string) => unknown }, a:string) => unknown} */
export const get = (model, key) => model.get(key);

/** @type {(url:string, text?: string) => string} */
export const url = (url, text = "") => {
    if (!/^(https?:\/\/|\/)/.test(url)) return "";
    if (!text || typeof text !== 'string') text = url.replace(/^https?:\/\//, '');
    return `<a href="${url}">${text}</a>`;
};

export { capitalize, dateToUtcTimestamp as utcTimestamp, prettify };

/** @type {(data: string) => string} */
export const json = (data) => {
    if (typeof data !== "string") data = JSON.stringify(data || []);
    return data
        .replace(/},\s*/g, "},\n")
        .replace(/,"/g, `, "`)
        .replace(/(^\[|\]$)/g, "")
        .replace(/\[/g, "[\n")
        .replace(/\]/g, "\n]");
};

/** @type {(data: unknown) => string} */
export const boolean = (data) => {
    const isTrue = typeof data === "string" ? data === "true" : !!data;
    return `<span class="${isTrue ? 'truthy' : 'falsy'}">${isTrue}</span>`;
}

/** @type {(data: unknown) => string} */
export const yesno = (data) => {
    const isYes = typeof data === "string" ? data === 'yes' : !!data;
    return `<span class="${isYes ? 'yes' : 'no'}">${isYes ? 'yes' : 'no'}</span>`;
};

/** @type {(data: unknown) => string} */
export const required = (data) => `<span class="${data || data === 'required' ? 'required' : ''}">${data || data === 'required' ? 'required' : ''}</span>`;

/** @type {(date:Date) => string} */
export const withRelativeDT = (date) => `<span class="mobile-hidden">${dateToUtcTimestamp(date)}</span> <span class="relativetime" title="${dateToUtcTimestamp(date)}"></span>`;

/** @type {(name: string, ...args: unknown[]) => unknown} */
export const call = function (name, ...args) {
    return typeof this[name] === "function" ? this[name](...args.slice(0, -1)) : void 0;
};

/** @type {(name: string, ctxt: object, ...args: unknown[]) => unknown} */
export const contextCall = (name, ctxt, ...args) => typeof ctxt[name] === "function" ? ctxt[name](...args.slice(0, -1)) : void 0;

/** @type {(prefix:string, text:string) => string} */
export const unprefix = (prefix, text) => text.replace(new RegExp(`^${prefix}\\s*?`), "");

/** @type {(prefix:string, text:string) => string} */
export const unsuffix = (suffix, text) => text.replace(new RegExp(`\\s*?${suffix}$`), "");

/** @type {<T>(array: T[]) => T[]} */
export const reverse = (array) => [...array].reverse();

/** @type {(c:object, k:string) => unknown} */
export const getter = (ctxt, propertyName) => ctxt[propertyName];

/** @type {(source: Map|Set) => any[]} */
export const values = (source) => [...source.values()];

/** @type {(source: object|unknown[]|Map|Set)=> number} */
export const len = (source) => {
    return source instanceof Map || source instanceof Set ?
        source.size :
        Array.isArray(source) ?
            source.length :
            Object.keys(source).length;
};

/** @type {(source:object[], key:string) => boolean} */
export const someTruthy = (source, key) => source.some((obj) => !!obj[key]);

/** @type {(n:number, t:string, s:string) => string} */
export const plural = (num, text, suffix) => `${num || 0} ${text}${num === 1 ? "" : suffix}`;

/** @type {(d:string|number|Date) => number} */
export const year = (date) => validateDate(date).getFullYear();

/** @type {(ts:number, t:string, s:string) => string} */
export const years = (seconds) => {
    const date = new Date(seconds * 1e3);
    const year = date.getFullYear();
    const diff = Date.now() - date.valueOf();

    const leap = !(year % 4) && (year % 100 || !(year % 400)) ? 1 : 0;
    const yrs = diff / (1e3 * 60 * 60 * 24 * (365 + leap));

    return plural(yrs === Math.trunc(yrs) ? yrs : +yrs.toFixed(1), "year", "s");;
};

/** @type {(n: number) => string} */
export const ordinal = (num) => `${num}<sup>${formatOrdinal(num).replace(/^\d+/, "")}</sup>`;

/**
 * @summary iterates over a collection
 * @param {Map<unknown, unknown> | Set<unknown> | unknown[]} source collection to iterate
 * @param {HelperOptions} options Handlebars helper options
 * @returns {string}
 */
export const iterate = (source, options) => {
    let output = "";
    source.forEach((val, key) => output += options.fn({ key, val }));
    return output;
};

/** @type {(...sources: unknown[]) => boolean} */
export const either = (...sources) => sources.slice(0, -1).some(Boolean);

/** @type {(a:unknown,b:unknown) => boolean} */
export const eq = (a, b) => a === b;

/** @type {(a:unknown,b:unknown) => boolean} */
export const neq = (a, b) => a !== b;

/**
 * @summary inverts a value (coerces to boolean)
 * @param {unknown} val value to invert
 * @returns {boolean}
 */
export const not = (val) => !val;

/**
 * @summary checks a source for including a value
 * @param {string|unknown[]} source source to check
 * @param {any} value value to check
 * @returns {boolean}
 */
export const includes = (source, value) => source.includes(value);