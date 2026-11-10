export const WAKEUP_V6170: {host:string;antispamPath:string;sharePath:string}
export function validateKey(input:string):false|string
export function extractKeyFromText(input:string):string
export interface Device {cuid:string;adid:string;did:string;nt:string}
export function wakeupCreateDevice():Device
export function wakeupMakeCommonParams(device:Device):string[][]
export function wakeupMakeSignA(cuid:string):{signA:string;rand10:string}
export function wakeupTokenFromSignB(signB:string,rand10:string):string
export function wakeupBuildShareRequest(code:string,token:string,device:Device,params:string[][]):{rc4Key:string;body:string}
export function wakeupExtractSignB(payload:unknown):string
export function wakeupRc4(data:string|Uint8Array,key:string):Uint8Array
export function wakeupBase64ToBytes(text:string):Uint8Array
export function wakeupBytesToBase64(bytes:Uint8Array):string
export function wakeupBytesToUtf8(bytes:Uint8Array):string
export function wakeupDesEncrypt(plain:string,key:string):Uint8Array
export function wakeupNativeHexEncode(bytes:Uint8Array):string
export function wakeupMd5Hex(text:string):string
export function wakeupGetRc4Key(token:string):string
