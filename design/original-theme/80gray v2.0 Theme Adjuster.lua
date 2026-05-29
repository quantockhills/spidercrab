--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]

local ____modules = {}
local ____moduleCache = {}
local ____originalRequire = require
local function require(file, ...)
    if ____moduleCache[file] then
        return ____moduleCache[file].value
    end
    if ____modules[file] then
        local module = ____modules[file]
        local value = nil
        if (select("#", ...) > 0) then value = module(...) else value = module(file) end
        ____moduleCache[file] = { value = value }
        return value
    else
        if ____originalRequire then
            return ____originalRequire(file)
        else
            error("module '" .. file .. "' not found")
        end
    end
end
____modules = {
["lualib_bundle"] = function(...) 
local function __TS__StringSubstring(self, start, ____end)
    if ____end ~= ____end then
        ____end = 0
    end
    if ____end ~= nil and start > ____end then
        start, ____end = ____end, start
    end
    if start >= 0 then
        start = start + 1
    else
        start = 1
    end
    if ____end ~= nil and ____end < 0 then
        ____end = 0
    end
    return string.sub(self, start, ____end)
end

local __TS__Match = string.match

local __TS__ParseInt
do
    local parseIntBasePattern = "0123456789aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTvVwWxXyYzZ"
    function __TS__ParseInt(numberString, base)
        if base == nil then
            base = 10
            local hexMatch = __TS__Match(numberString, "^%s*-?0[xX]")
            if hexMatch ~= nil then
                base = 16
                numberString = (__TS__Match(hexMatch, "-")) and "-" .. __TS__StringSubstring(numberString, #hexMatch) or __TS__StringSubstring(numberString, #hexMatch)
            end
        end
        if base < 2 or base > 36 then
            return 0 / 0
        end
        local allowedDigits = base <= 10 and __TS__StringSubstring(parseIntBasePattern, 0, base) or __TS__StringSubstring(parseIntBasePattern, 0, 10 + 2 * (base - 10))
        local pattern = ("^%s*(-?[" .. allowedDigits) .. "]*)"
        local number = tonumber((__TS__Match(numberString, pattern)), base)
        if number == nil then
            return 0 / 0
        end
        if number >= 0 then
            return math.floor(number)
        else
            return math.ceil(number)
        end
    end
end

local function __TS__Number(value)
    local valueType = type(value)
    if valueType == "number" then
        return value
    elseif valueType == "string" then
        local numberValue = tonumber(value)
        if numberValue then
            return numberValue
        end
        if value == "Infinity" then
            return math.huge
        end
        if value == "-Infinity" then
            return -math.huge
        end
        local stringWithoutSpaces = string.gsub(value, "%s", "")
        if stringWithoutSpaces == "" then
            return 0
        end
        return 0 / 0
    elseif valueType == "boolean" then
        return value and 1 or 0
    else
        return 0 / 0
    end
end

local function __TS__NumberIsNaN(value)
    return value ~= value
end

local function __TS__Class(self)
    local c = {prototype = {}}
    c.prototype.__index = c.prototype
    c.prototype.constructor = c
    return c
end

local function __TS__CloneDescriptor(____bindingPattern0)
    local value
    local writable
    local set
    local get
    local configurable
    local enumerable
    enumerable = ____bindingPattern0.enumerable
    configurable = ____bindingPattern0.configurable
    get = ____bindingPattern0.get
    set = ____bindingPattern0.set
    writable = ____bindingPattern0.writable
    value = ____bindingPattern0.value
    local descriptor = {enumerable = enumerable == true, configurable = configurable == true}
    local hasGetterOrSetter = get ~= nil or set ~= nil
    local hasValueOrWritableAttribute = writable ~= nil or value ~= nil
    if hasGetterOrSetter and hasValueOrWritableAttribute then
        error("Invalid property descriptor. Cannot both specify accessors and a value or writable attribute.", 0)
    end
    if get or set then
        descriptor.get = get
        descriptor.set = set
    else
        descriptor.value = value
        descriptor.writable = writable == true
    end
    return descriptor
end

local __TS__DescriptorGet
do
    local getmetatable = _G.getmetatable
    local ____rawget = _G.rawget
    function __TS__DescriptorGet(self, metatable, key)
        while metatable do
            local rawResult = ____rawget(metatable, key)
            if rawResult ~= nil then
                return rawResult
            end
            local descriptors = ____rawget(metatable, "_descriptors")
            if descriptors then
                local descriptor = descriptors[key]
                if descriptor ~= nil then
                    if descriptor.get then
                        return descriptor.get(self)
                    end
                    return descriptor.value
                end
            end
            metatable = getmetatable(metatable)
        end
    end
end

local __TS__DescriptorSet
do
    local getmetatable = _G.getmetatable
    local ____rawget = _G.rawget
    local rawset = _G.rawset
    function __TS__DescriptorSet(self, metatable, key, value)
        while metatable do
            local descriptors = ____rawget(metatable, "_descriptors")
            if descriptors then
                local descriptor = descriptors[key]
                if descriptor ~= nil then
                    if descriptor.set then
                        descriptor.set(self, value)
                    else
                        if descriptor.writable == false then
                            error(
                                ((("Cannot assign to read only property '" .. key) .. "' of object '") .. tostring(self)) .. "'",
                                0
                            )
                        end
                        descriptor.value = value
                    end
                    return
                end
            end
            metatable = getmetatable(metatable)
        end
        rawset(self, key, value)
    end
end

local __TS__SetDescriptor
do
    local getmetatable = _G.getmetatable
    local function descriptorIndex(self, key)
        return __TS__DescriptorGet(
            self,
            getmetatable(self),
            key
        )
    end
    local function descriptorNewIndex(self, key, value)
        return __TS__DescriptorSet(
            self,
            getmetatable(self),
            key,
            value
        )
    end
    function __TS__SetDescriptor(target, key, desc, isPrototype)
        if isPrototype == nil then
            isPrototype = false
        end
        local ____isPrototype_0
        if isPrototype then
            ____isPrototype_0 = target
        else
            ____isPrototype_0 = getmetatable(target)
        end
        local metatable = ____isPrototype_0
        if not metatable then
            metatable = {}
            setmetatable(target, metatable)
        end
        local value = rawget(target, key)
        if value ~= nil then
            rawset(target, key, nil)
        end
        if not rawget(metatable, "_descriptors") then
            metatable._descriptors = {}
        end
        metatable._descriptors[key] = __TS__CloneDescriptor(desc)
        metatable.__index = descriptorIndex
        metatable.__newindex = descriptorNewIndex
    end
end

local function __TS__ObjectValues(obj)
    local result = {}
    local len = 0
    for key in pairs(obj) do
        len = len + 1
        result[len] = obj[key]
    end
    return result
end

local function __TS__ArrayIncludes(self, searchElement, fromIndex)
    if fromIndex == nil then
        fromIndex = 0
    end
    local len = #self
    local k = fromIndex
    if fromIndex < 0 then
        k = len + fromIndex
    end
    if k < 0 then
        k = 0
    end
    for i = k + 1, len do
        if self[i] == searchElement then
            return true
        end
    end
    return false
end

local function __TS__New(target, ...)
    local instance = setmetatable({}, target.prototype)
    instance:____constructor(...)
    return instance
end

local function __TS__ArrayForEach(self, callbackFn, thisArg)
    for i = 1, #self do
        callbackFn(thisArg, self[i], i - 1, self)
    end
end

local function __TS__StringIncludes(self, searchString, position)
    if not position then
        position = 1
    else
        position = position + 1
    end
    local index = string.find(self, searchString, position, true)
    return index ~= nil
end

local function __TS__ClassExtends(target, base)
    target.____super = base
    local staticMetatable = setmetatable({__index = base}, base)
    setmetatable(target, staticMetatable)
    local baseMetatable = getmetatable(base)
    if baseMetatable then
        if type(baseMetatable.__index) == "function" then
            staticMetatable.__index = baseMetatable.__index
        end
        if type(baseMetatable.__newindex) == "function" then
            staticMetatable.__newindex = baseMetatable.__newindex
        end
    end
    setmetatable(target.prototype, base.prototype)
    if type(base.prototype.__index) == "function" then
        target.prototype.__index = base.prototype.__index
    end
    if type(base.prototype.__newindex) == "function" then
        target.prototype.__newindex = base.prototype.__newindex
    end
    if type(base.prototype.__tostring) == "function" then
        target.prototype.__tostring = base.prototype.__tostring
    end
end

local Error, RangeError, ReferenceError, SyntaxError, TypeError, URIError
do
    local function getErrorStack(self, constructor)
        if debug == nil then
            return nil
        end
        local level = 1
        while true do
            local info = debug.getinfo(level, "f")
            level = level + 1
            if not info then
                level = 1
                break
            elseif info.func == constructor then
                break
            end
        end
        if __TS__StringIncludes(_VERSION, "Lua 5.0") then
            return debug.traceback(("[Level " .. tostring(level)) .. "]")
        else
            return debug.traceback(nil, level)
        end
    end
    local function wrapErrorToString(self, getDescription)
        return function(self)
            local description = getDescription(self)
            local caller = debug.getinfo(3, "f")
            local isClassicLua = __TS__StringIncludes(_VERSION, "Lua 5.0") or _VERSION == "Lua 5.1"
            if isClassicLua or caller and caller.func ~= error then
                return description
            else
                return (description .. "\n") .. tostring(self.stack)
            end
        end
    end
    local function initErrorClass(self, Type, name)
        Type.name = name
        return setmetatable(
            Type,
            {__call = function(____, _self, message) return __TS__New(Type, message) end}
        )
    end
    local ____initErrorClass_1 = initErrorClass
    local ____class_0 = __TS__Class()
    ____class_0.name = ""
    function ____class_0.prototype.____constructor(self, message)
        if message == nil then
            message = ""
        end
        self.message = message
        self.name = "Error"
        self.stack = getErrorStack(nil, self.constructor.new)
        local metatable = getmetatable(self)
        if metatable and not metatable.__errorToStringPatched then
            metatable.__errorToStringPatched = true
            metatable.__tostring = wrapErrorToString(nil, metatable.__tostring)
        end
    end
    function ____class_0.prototype.__tostring(self)
        return self.message ~= "" and (self.name .. ": ") .. self.message or self.name
    end
    Error = ____initErrorClass_1(nil, ____class_0, "Error")
    local function createErrorClass(self, name)
        local ____initErrorClass_3 = initErrorClass
        local ____class_2 = __TS__Class()
        ____class_2.name = ____class_2.name
        __TS__ClassExtends(____class_2, Error)
        function ____class_2.prototype.____constructor(self, ...)
            ____class_2.____super.prototype.____constructor(self, ...)
            self.name = name
        end
        return ____initErrorClass_3(nil, ____class_2, name)
    end
    RangeError = createErrorClass(nil, "RangeError")
    ReferenceError = createErrorClass(nil, "ReferenceError")
    SyntaxError = createErrorClass(nil, "SyntaxError")
    TypeError = createErrorClass(nil, "TypeError")
    URIError = createErrorClass(nil, "URIError")
end

local function __TS__ArrayIsArray(value)
    return type(value) == "table" and (value[1] ~= nil or next(value) == nil)
end

local function __TS__TypeOf(value)
    local luaType = type(value)
    if luaType == "table" then
        return "object"
    elseif luaType == "nil" then
        return "undefined"
    else
        return luaType
    end
end

local function __TS__ArraySome(self, callbackfn, thisArg)
    for i = 1, #self do
        if callbackfn(thisArg, self[i], i - 1, self) then
            return true
        end
    end
    return false
end

local function __TS__StringSlice(self, start, ____end)
    if start == nil or start ~= start then
        start = 0
    end
    if ____end ~= ____end then
        ____end = 0
    end
    if start >= 0 then
        start = start + 1
    end
    if ____end ~= nil and ____end < 0 then
        ____end = ____end - 1
    end
    return string.sub(self, start, ____end)
end

local function __TS__ArraySetLength(self, length)
    if length < 0 or length ~= length or length == math.huge or math.floor(length) ~= length then
        error(
            "invalid array length: " .. tostring(length),
            0
        )
    end
    for i = length + 1, #self do
        self[i] = nil
    end
    return length
end

local __TS__Symbol, Symbol
do
    local symbolMetatable = {__tostring = function(self)
        return ("Symbol(" .. (self.description or "")) .. ")"
    end}
    function __TS__Symbol(description)
        return setmetatable({description = description}, symbolMetatable)
    end
    Symbol = {
        asyncDispose = __TS__Symbol("Symbol.asyncDispose"),
        dispose = __TS__Symbol("Symbol.dispose"),
        iterator = __TS__Symbol("Symbol.iterator"),
        hasInstance = __TS__Symbol("Symbol.hasInstance"),
        species = __TS__Symbol("Symbol.species"),
        toStringTag = __TS__Symbol("Symbol.toStringTag")
    }
end

local __TS__Iterator
do
    local function iteratorGeneratorStep(self)
        local co = self.____coroutine
        local status, value = coroutine.resume(co)
        if not status then
            error(value, 0)
        end
        if coroutine.status(co) == "dead" then
            return
        end
        return true, value
    end
    local function iteratorIteratorStep(self)
        local result = self:next()
        if result.done then
            return
        end
        return true, result.value
    end
    local function iteratorStringStep(self, index)
        index = index + 1
        if index > #self then
            return
        end
        return index, string.sub(self, index, index)
    end
    function __TS__Iterator(iterable)
        if type(iterable) == "string" then
            return iteratorStringStep, iterable, 0
        elseif iterable.____coroutine ~= nil then
            return iteratorGeneratorStep, iterable
        elseif iterable[Symbol.iterator] then
            local iterator = iterable[Symbol.iterator](iterable)
            return iteratorIteratorStep, iterator
        else
            return ipairs(iterable)
        end
    end
end

local function __TS__ObjectAssign(target, ...)
    local sources = {...}
    for i = 1, #sources do
        local source = sources[i]
        for key in pairs(source) do
            target[key] = source[key]
        end
    end
    return target
end

local function __TS__ArraySort(self, compareFn)
    if compareFn ~= nil then
        table.sort(
            self,
            function(a, b) return compareFn(nil, a, b) < 0 end
        )
    else
        table.sort(self)
    end
    return self
end

local function __TS__CountVarargs(...)
    return select("#", ...)
end

local __TS__Unpack = table.unpack or unpack

local __TS__Generator
do
    local function generatorIterator(self)
        return self
    end
    local function generatorNext(self, ...)
        local co = self.____coroutine
        if coroutine.status(co) == "dead" then
            return {done = true}
        end
        local status, value = coroutine.resume(co, ...)
        if not status then
            error(value, 0)
        end
        return {
            value = value,
            done = coroutine.status(co) == "dead"
        }
    end
    function __TS__Generator(fn)
        return function(...)
            local args = {...}
            local argsLength = __TS__CountVarargs(...)
            return {
                ____coroutine = coroutine.create(function() return fn(__TS__Unpack(args, 1, argsLength)) end),
                [Symbol.iterator] = generatorIterator,
                next = generatorNext
            }
        end
    end
end

local function __TS__ObjectGetOwnPropertyDescriptors(object)
    local metatable = getmetatable(object)
    if not metatable then
        return {}
    end
    return rawget(metatable, "_descriptors") or ({})
end

local function __TS__Delete(target, key)
    local descriptors = __TS__ObjectGetOwnPropertyDescriptors(target)
    local descriptor = descriptors[key]
    if descriptor then
        if not descriptor.configurable then
            error(
                __TS__New(
                    TypeError,
                    ((("Cannot delete property " .. tostring(key)) .. " of ") .. tostring(target)) .. "."
                ),
                0
            )
        end
        descriptors[key] = nil
        return true
    end
    target[key] = nil
    return true
end

local function __TS__StringAccess(self, index)
    if index >= 0 and index < #self then
        return string.sub(self, index + 1, index + 1)
    end
end

local function __TS__ParseFloat(numberString)
    local infinityMatch = __TS__Match(numberString, "^%s*(-?Infinity)")
    if infinityMatch ~= nil then
        return __TS__StringAccess(infinityMatch, 0) == "-" and -math.huge or math.huge
    end
    local number = tonumber((__TS__Match(numberString, "^%s*(-?%d+%.?%d*)")))
    return number or 0 / 0
end

local function __TS__StringCharAt(self, pos)
    if pos ~= pos then
        pos = 0
    end
    if pos < 0 then
        return ""
    end
    return string.sub(self, pos + 1, pos + 1)
end

local function __TS__InstanceOf(obj, classTbl)
    if type(classTbl) ~= "table" then
        error("Right-hand side of 'instanceof' is not an object", 0)
    end
    if classTbl[Symbol.hasInstance] ~= nil then
        return not not classTbl[Symbol.hasInstance](classTbl, obj)
    end
    if type(obj) == "table" then
        local luaClass = obj.constructor
        while luaClass ~= nil do
            if luaClass == classTbl then
                return true
            end
            luaClass = luaClass.____super
        end
    end
    return false
end

local __TS__Promise
do
    local function makeDeferredPromiseFactory()
        local resolve
        local reject
        local function executor(____, res, rej)
            resolve = res
            reject = rej
        end
        return function()
            local promise = __TS__New(__TS__Promise, executor)
            return promise, resolve, reject
        end
    end
    local makeDeferredPromise = makeDeferredPromiseFactory()
    local function isPromiseLike(value)
        return __TS__InstanceOf(value, __TS__Promise)
    end
    local function doNothing(self)
    end
    local ____pcall = _G.pcall
    __TS__Promise = __TS__Class()
    __TS__Promise.name = "__TS__Promise"
    function __TS__Promise.prototype.____constructor(self, executor)
        self.state = 0
        self.fulfilledCallbacks = {}
        self.rejectedCallbacks = {}
        self.finallyCallbacks = {}
        local success, ____error = ____pcall(
            executor,
            nil,
            function(____, v) return self:resolve(v) end,
            function(____, err) return self:reject(err) end
        )
        if not success then
            self:reject(____error)
        end
    end
    function __TS__Promise.resolve(value)
        if __TS__InstanceOf(value, __TS__Promise) then
            return value
        end
        local promise = __TS__New(__TS__Promise, doNothing)
        promise.state = 1
        promise.value = value
        return promise
    end
    function __TS__Promise.reject(reason)
        local promise = __TS__New(__TS__Promise, doNothing)
        promise.state = 2
        promise.rejectionReason = reason
        return promise
    end
    __TS__Promise.prototype["then"] = function(self, onFulfilled, onRejected)
        local promise, resolve, reject = makeDeferredPromise()
        self:addCallbacks(
            onFulfilled and self:createPromiseResolvingCallback(onFulfilled, resolve, reject) or resolve,
            onRejected and self:createPromiseResolvingCallback(onRejected, resolve, reject) or reject
        )
        return promise
    end
    function __TS__Promise.prototype.addCallbacks(self, fulfilledCallback, rejectedCallback)
        if self.state == 1 then
            return fulfilledCallback(nil, self.value)
        end
        if self.state == 2 then
            return rejectedCallback(nil, self.rejectionReason)
        end
        local ____self_fulfilledCallbacks_0 = self.fulfilledCallbacks
        ____self_fulfilledCallbacks_0[#____self_fulfilledCallbacks_0 + 1] = fulfilledCallback
        local ____self_rejectedCallbacks_1 = self.rejectedCallbacks
        ____self_rejectedCallbacks_1[#____self_rejectedCallbacks_1 + 1] = rejectedCallback
    end
    function __TS__Promise.prototype.catch(self, onRejected)
        return self["then"](self, nil, onRejected)
    end
    function __TS__Promise.prototype.finally(self, onFinally)
        if onFinally then
            local ____self_finallyCallbacks_2 = self.finallyCallbacks
            ____self_finallyCallbacks_2[#____self_finallyCallbacks_2 + 1] = onFinally
            if self.state ~= 0 then
                onFinally(nil)
            end
        end
        return self
    end
    function __TS__Promise.prototype.resolve(self, value)
        if isPromiseLike(value) then
            return value:addCallbacks(
                function(____, v) return self:resolve(v) end,
                function(____, err) return self:reject(err) end
            )
        end
        if self.state == 0 then
            self.state = 1
            self.value = value
            return self:invokeCallbacks(self.fulfilledCallbacks, value)
        end
    end
    function __TS__Promise.prototype.reject(self, reason)
        if self.state == 0 then
            self.state = 2
            self.rejectionReason = reason
            return self:invokeCallbacks(self.rejectedCallbacks, reason)
        end
    end
    function __TS__Promise.prototype.invokeCallbacks(self, callbacks, value)
        local callbacksLength = #callbacks
        local finallyCallbacks = self.finallyCallbacks
        local finallyCallbacksLength = #finallyCallbacks
        if callbacksLength ~= 0 then
            for i = 1, callbacksLength - 1 do
                callbacks[i](callbacks, value)
            end
            if finallyCallbacksLength == 0 then
                return callbacks[callbacksLength](callbacks, value)
            end
            callbacks[callbacksLength](callbacks, value)
        end
        if finallyCallbacksLength ~= 0 then
            for i = 1, finallyCallbacksLength - 1 do
                finallyCallbacks[i](finallyCallbacks)
            end
            return finallyCallbacks[finallyCallbacksLength](finallyCallbacks)
        end
    end
    function __TS__Promise.prototype.createPromiseResolvingCallback(self, f, resolve, reject)
        return function(____, value)
            local success, resultOrError = ____pcall(f, nil, value)
            if not success then
                return reject(nil, resultOrError)
            end
            return self:handleCallbackValue(resultOrError, resolve, reject)
        end
    end
    function __TS__Promise.prototype.handleCallbackValue(self, value, resolve, reject)
        if isPromiseLike(value) then
            local nextpromise = value
            if nextpromise.state == 1 then
                return resolve(nil, nextpromise.value)
            elseif nextpromise.state == 2 then
                return reject(nil, nextpromise.rejectionReason)
            else
                return nextpromise:addCallbacks(resolve, reject)
            end
        else
            return resolve(nil, value)
        end
    end
end

return {
  __TS__ParseInt = __TS__ParseInt,
  __TS__Number = __TS__Number,
  __TS__NumberIsNaN = __TS__NumberIsNaN,
  __TS__Class = __TS__Class,
  __TS__SetDescriptor = __TS__SetDescriptor,
  __TS__ObjectValues = __TS__ObjectValues,
  __TS__ArrayIncludes = __TS__ArrayIncludes,
  __TS__New = __TS__New,
  __TS__ArrayForEach = __TS__ArrayForEach,
  Error = Error,
  RangeError = RangeError,
  ReferenceError = ReferenceError,
  SyntaxError = SyntaxError,
  TypeError = TypeError,
  URIError = URIError,
  __TS__ArrayIsArray = __TS__ArrayIsArray,
  __TS__TypeOf = __TS__TypeOf,
  __TS__ArraySome = __TS__ArraySome,
  __TS__StringSlice = __TS__StringSlice,
  __TS__ArraySetLength = __TS__ArraySetLength,
  __TS__Iterator = __TS__Iterator,
  __TS__ObjectAssign = __TS__ObjectAssign,
  __TS__ArraySort = __TS__ArraySort,
  __TS__Generator = __TS__Generator,
  __TS__Delete = __TS__Delete,
  __TS__ParseFloat = __TS__ParseFloat,
  __TS__StringCharAt = __TS__StringCharAt,
  __TS__Promise = __TS__Promise
}
 end,
["index"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__ParseInt = ____lualib.__TS__ParseInt
local __TS__Number = ____lualib.__TS__Number
local __TS__NumberIsNaN = ____lualib.__TS__NumberIsNaN
local __TS__Class = ____lualib.__TS__Class
local __TS__SetDescriptor = ____lualib.__TS__SetDescriptor
local __TS__ObjectValues = ____lualib.__TS__ObjectValues
local __TS__ArrayIncludes = ____lualib.__TS__ArrayIncludes
local __TS__New = ____lualib.__TS__New
local __TS__ArrayForEach = ____lualib.__TS__ArrayForEach
local Error = ____lualib.Error
local RangeError = ____lualib.RangeError
local ReferenceError = ____lualib.ReferenceError
local SyntaxError = ____lualib.SyntaxError
local TypeError = ____lualib.TypeError
local URIError = ____lualib.URIError
local __TS__ArrayIsArray = ____lualib.__TS__ArrayIsArray
local __TS__TypeOf = ____lualib.__TS__TypeOf
local __TS__ArraySome = ____lualib.__TS__ArraySome
local ____exports = {}
local Tabs
local ____json = require("lua_modules.json.index")
local decode = ____json.decode
local encode = ____json.encode
local ____clipboard = require("lua_modules.reaper-api.clipboard")
local copy = ____clipboard.copy
local paste = ____clipboard.paste
local ____extstate = require("lua_modules.reaper-api.extstate")
local Section = ____extstate.Section
local ____inspect = require("lua_modules.reaper-api.inspect")
local inspect = ____inspect.inspect
local ____utils = require("lua_modules.reaper-api.utils")
local assertUnreachable = ____utils.assertUnreachable
local errorHandler = ____utils.errorHandler
local log = ____utils.log
local processError = ____utils.processError
local ____reaper_2Dmicroui = require("lua_modules.reaper-microui.build.index")
local ColorId = ____reaper_2Dmicroui.ColorId
local createContext = ____reaper_2Dmicroui.createContext
local microUILoop = ____reaper_2Dmicroui.microUILoop
local MouseButton = ____reaper_2Dmicroui.MouseButton
local Option = ____reaper_2Dmicroui.Option
local rect = ____reaper_2Dmicroui.rect
local rgba = ____reaper_2Dmicroui.rgba
local THEME_VERSION = 200
local config = (function()
    local section = Section(nil, "80gray-theme-adjuster")
    local function getConfigNumber(self, name)
        local str = section:get(name)
        if str == nil then
            return nil
        end
        local num = __TS__ParseInt(str)
        if __TS__NumberIsNaN(__TS__Number(num)) then
            return nil
        end
        return num
    end
    local ThemeAdjusterConfig = __TS__Class()
    ThemeAdjusterConfig.name = "ThemeAdjusterConfig"
    function ThemeAdjusterConfig.prototype.____constructor(self)
    end
    __TS__SetDescriptor(
        ThemeAdjusterConfig.prototype,
        "windowX",
        {
            get = function(self)
                return getConfigNumber(nil, "windowX")
            end,
            set = function(self, val)
                section:set(
                    "windowX",
                    val ~= nil and tostring(val) or val
                )
            end
        },
        true
    )
    __TS__SetDescriptor(
        ThemeAdjusterConfig.prototype,
        "windowY",
        {
            get = function(self)
                return getConfigNumber(nil, "windowY")
            end,
            set = function(self, val)
                section:set(
                    "windowY",
                    val ~= nil and tostring(val) or val
                )
            end
        },
        true
    )
    __TS__SetDescriptor(
        ThemeAdjusterConfig.prototype,
        "windowW",
        {
            get = function(self)
                return getConfigNumber(nil, "windowW")
            end,
            set = function(self, val)
                section:set(
                    "windowW",
                    val ~= nil and tostring(val) or val
                )
            end
        },
        true
    )
    __TS__SetDescriptor(
        ThemeAdjusterConfig.prototype,
        "windowH",
        {
            get = function(self)
                return getConfigNumber(nil, "windowH")
            end,
            set = function(self, val)
                section:set(
                    "windowH",
                    val ~= nil and tostring(val) or val
                )
            end
        },
        true
    )
    __TS__SetDescriptor(
        ThemeAdjusterConfig.prototype,
        "windowDock",
        {
            get = function(self)
                return getConfigNumber(nil, "windowDock")
            end,
            set = function(self, val)
                section:set(
                    "windowDock",
                    val ~= nil and tostring(val) or val
                )
            end
        },
        true
    )
    __TS__SetDescriptor(
        ThemeAdjusterConfig.prototype,
        "activeTab",
        {
            get = function(self)
                local text = section:get("activeTab")
                if text == nil then
                    return nil
                end
                if not __TS__ArrayIncludes(
                    __TS__ObjectValues(Tabs),
                    text
                ) then
                    return nil
                end
                return text
            end,
            set = function(self, val)
                section:set("activeTab", val)
            end
        },
        true
    )
    return __TS__New(ThemeAdjusterConfig)
end)(nil)
local function getWindowInfo(self)
    local dock, x, y, w, h = gfx.dock(
        -1,
        0,
        0,
        0,
        0
    )
    return {
        dock = dock,
        x = x,
        y = y,
        w = w,
        h = h
    }
end
local function drawActiveTabFrame(self, ctx, r, color)
    ctx:drawRect({x = r.x + 1, y = r.y, w = r.w - 2, h = 1}, color)
    ctx:drawRect({x = r.x, y = r.y, w = 1, h = r.h}, color)
    ctx:drawRect({x = r.x + r.w - 1, y = r.y, w = 1, h = r.h}, color)
end
local function drawInactiveTabFrame(self, ctx, r, color)
    ctx:drawRect({x = r.x, y = r.y + r.h - 1, w = r.w, h = 1}, color)
end
local function tabsWidget(self, ctx, identifier, tabs, activeTab)
    ctx:pushId(identifier)
    do
        local allTabsRect = ctx:layoutNext()
        local availableSpace = allTabsRect.w + ctx.style.spacing
        local tabWidth = availableSpace / #tabs
        __TS__ArrayForEach(
            tabs,
            function(____, tab, i)
                local id = ctx:getId(tab)
                local r = rect(
                    nil,
                    tabWidth * i,
                    allTabsRect.y,
                    tabWidth,
                    allTabsRect.h
                )
                ctx:updateControl(id, r, 0)
                if ctx.mousePressed == MouseButton.Left and ctx.focus == id then
                    activeTab = tab
                end
                if tab == activeTab then
                    if ctx.style.colors[ColorId.Border].a > 0 then
                        drawActiveTabFrame(nil, ctx, r, ctx.style.colors[ColorId.Border])
                    end
                    ctx:drawControlText(tab, r, ColorId.Text, 0)
                else
                    local color = ctx.focus == id and rgba(
                        nil,
                        80,
                        80,
                        80,
                        1
                    ) or (ctx.hover == id and rgba(
                        nil,
                        60,
                        60,
                        60,
                        1
                    ) or rgba(
                        nil,
                        30,
                        30,
                        30,
                        1
                    ))
                    if color ~= nil then
                        ctx:drawRect(r, color)
                    end
                    if ctx.style.colors[ColorId.Border].a > 0 then
                        drawInactiveTabFrame(nil, ctx, r, ctx.style.colors[ColorId.Border])
                    end
                    local oldTextColor = ctx.style.colors[ColorId.Text]
                    ctx.style.colors[ColorId.Text] = rgba(
                        nil,
                        140,
                        140,
                        140,
                        1
                    )
                    ctx:drawControlText(tab, r, ColorId.Text, 0)
                    ctx.style.colors[ColorId.Text] = oldTextColor
                end
            end
        )
    end
    ctx:popId()
    return activeTab
end
local themeHasChanged = (function()
    local prevTheme = ""
    return function()
        local newTheme = reaper.GetLastColorThemeFile()
        if newTheme ~= prevTheme then
            prevTheme = newTheme
            return true
        else
            return false
        end
    end
end)(nil)
local function getThemeParameters(self)
    local result = {}
    local i = 0
    while true do
        local name, description, currentValue, defaultValue, minValue, maxValue = reaper.ThemeLayout_GetParameter(i)
        if name == nil then
            break
        end
        result[name] = {
            id = i,
            description = description,
            currentValue = currentValue,
            defaultValue = defaultValue,
            minValue = minValue,
            maxValue = maxValue
        }
        i = i + 1
    end
    local nativeParams = {
        {name = "gamma", id = -1000},
        {name = "highlightbg", id = -1003},
        {name = "midtonebg", id = -1002},
        {name = "shadowbg", id = -1001},
        {name = "saturation", id = -1004},
        {name = "tint", id = -1005},
        {name = "color_apply_all", id = -1006}
    }
    for ____, native in ipairs(nativeParams) do
        local name, description, currentValue, defaultValue, minValue, maxValue = reaper.ThemeLayout_GetParameter(native.id)
        if name == nil then
            error(
                __TS__New(Error, "Failed to get native color-adjustment controls"),
                0
            )
        end
        result[native.name] = {
            id = native.id,
            description = description,
            currentValue = currentValue,
            defaultValue = defaultValue,
            minValue = minValue,
            maxValue = maxValue
        }
    end
    return result
end
--- Known params for the 80gray theme
local P = P or ({})
P.NATIVE_TINT = "tint"
P.NATIVE_SATURATION = "saturation"
P.NATIVE_HIGHLIGHT_BG = "highlightbg"
P.NATIVE_MIDTONE_BG = "midtonebg"
P.NATIVE_SHADOW_BG = "shadowbg"
P.NATIVE_GAMMA = "gamma"
P.NATIVE_COLOR_APPLY_ALL = "color_apply_all"
P.VERSION = "p_80gray_version"
P.SCALE_FONT = "p_scale_font"
P.TCP_TINT = "p_tcp_tint"
P.TCP_METER_WIDTH = "p_tcp_meter_width"
P.TCP_METER_TEXT_IN_BG = "p_tcp_meter_text_in_bg"
P.TCP_METER_TEXT_IN_FG = "p_tcp_meter_text_in_fg"
P.TCP_METER_TEXT_ONLY_IF_TALL = "p_tcp_meter_text_only_if_tall"
P.TCP_FOLDER_INDENT = "p_tcp_folder_indent"
P.TCP_INDICATOR_WIDTH = "p_tcp_indicator_width"
P.TCP_INDICATOR_SHOW_RECARM = "p_tcp_indicator_show_recarm"
P.TCP_FXLIST_WIDTH = "p_tcp_fxlist_width"
P.TCP_FXLIST_COLUMNS = "p_tcp_fxlist_columns"
P.TCP_HORIZONTAL_TEXT_HACK = "p_tcp_horizontal_text_hack"
P.TCP_NO_FADE = "p_tcp_no_fade"
P.TCP_MAX_RECINPUT_WIDTH = "p_tcp_max_recinput_width"
P.TCP_HIGH_CONTRAST = "p_tcp_high_contrast"
P.TCP_SINGLE_ROW_PAN_IO = "p_tcp_single_row_pan_io"
P.TCP_PERMANENT_REC_SECTION = "p_tcp_permanent_rec_section"
P.TCP_FXPARM_COL_WIDTH = "p_tcp_fxparm_col_width"
P.MCP_WIDTH = "p_mcp_width"
P.MCP_DIAGRAM_HEIGHT = "p_mcp_diagram_height"
P.MCP_DIAGRAM_MAX_ROWS = "p_mcp_diagram_max_rows"
P.MCP_METER_TEXT_IN_BG = "p_mcp_meter_text_in_bg"
P.MCP_METER_TEXT_IN_FG = "p_mcp_meter_text_in_fg"
P.MCP_FOLDER_INDENT = "p_mcp_folder_indent"
P.MCP_INDICATOR_WIDTH = "p_mcp_indicator_width"
P.MCP_INDICATOR_SHOW_RECARM = "p_mcp_indicator_show_recarm"
P.MCP_TINT = "p_mcp_tint"
P.MASTER_MCP_WIDTH = "p_master_mcp_width"
P.TRANS_HEIGHT = "p_trans_height"
P.TRANS_SHOW_PAUSE_BUTTON = "p_trans_show_pause_button"
P.TRANS_SEL_W = "p_trans_sel_w"
P.TRANS_SEL_H = "p_trans_sel_h"
P.TRANS_SEL_LABEL_W = "p_trans_sel_label_w"
P.TRANS_SEL_TEXT_H = "p_trans_sel_text_h"
Tabs = Tabs or ({})
Tabs.General = "General"
Tabs.TCP = "Track Panel"
Tabs.MCP = "Mixer Panel"
Tabs.Transport = "Transport"
local function main(self)
    local setParam, themeParams, needLayoutRefresh
    function setParam(self, key, value)
        if not (themeParams[key] ~= nil) then
            error(
                __TS__New(
                    Error,
                    "Set theme parameter does not exist: " .. encode(key)
                ),
                0
            )
        end
        local param = themeParams[key]
        local ____temp_0
        if type(value) == "boolean" then
            ____temp_0 = value ~= (param.currentValue ~= 0)
        else
            ____temp_0 = math.floor(value + 0.5) ~= math.floor(param.currentValue + 0.5)
        end
        local needChange = ____temp_0
        if needChange then
            local numValue = type(value) == "boolean" and (value and 1 or 0) or value
            reaper.ThemeLayout_SetParameter(param.id, numValue, true)
            param.currentValue = numValue
            needLayoutRefresh = true
        end
    end
    do
        local WINDOW_DEFAULT_WIDTH = 400
        local WINDOW_DEFAULT_HEIGHT = 800
        local WINDOW_DEFAULT_DOCK = 0
        local WINDOW_DEFAULT_X = 100
        local WINDOW_DEFAULT_Y = 50
        gfx.init(
            "80gray Theme Adjuster",
            config.windowW or WINDOW_DEFAULT_WIDTH,
            config.windowH or WINDOW_DEFAULT_HEIGHT,
            config.windowDock or WINDOW_DEFAULT_DOCK,
            config.windowX or WINDOW_DEFAULT_X,
            config.windowY or WINDOW_DEFAULT_Y
        )
        gfx.setfont(1, "Arial", 14)
        gfx.setfont(2, "Arial", 24)
    end
    local ctx = createContext(nil)
    ctx.style.font = 1
    local activeTab = config.activeTab or Tabs.TCP
    themeHasChanged(nil)
    themeParams = getThemeParameters(nil)
    needLayoutRefresh = false
    local hintText = ""
    local function hint(self, text)
        local shouldShowHint = ctx.focus == ctx.lastId or ctx.hover == ctx.lastId
        if shouldShowHint then
            hintText = text
        end
    end
    local function serialiseSettings(self)
        local result = {}
        for ____, key in ipairs(__TS__ObjectValues(P)) do
            do
                if not (themeParams[key] ~= nil) then
                    error(
                        __TS__New(
                            Error,
                            "Failed to copy missing parameter: " .. encode(key)
                        ),
                        0
                    )
                end
                if key == P.VERSION then
                    goto __continue48
                end
                local param = themeParams[key]
                result[key] = param.currentValue
            end
            ::__continue48::
        end
        return encode(result)
    end
    local function applySettings(self, text)
        local settings
        do
            local function ____catch(err)
                error(
                    __TS__New(
                        Error,
                        "Clipboard contains invalid JSON: " .. tostring(err)
                    ),
                    0
                )
            end
            local ____try, ____hasReturned = pcall(function()
                settings = decode(text)
            end)
            if not ____try then
                ____catch(____hasReturned)
            end
        end
        if __TS__ArrayIsArray(settings) then
            error(
                __TS__New(Error, "Expected clipboard to contain a JSON object, but instead contains an array"),
                0
            )
        end
        if type(settings) ~= "table" or settings == nil then
            error(
                __TS__New(
                    Error,
                    "Expected clipboard to contain a JSON object, but instead contains a " .. __TS__TypeOf(settings)
                ),
                0
            )
        end
        for ____, key in ipairs(__TS__ObjectValues(P)) do
            do
                if key == P.VERSION then
                    goto __continue57
                end
                if not (settings[key] ~= nil) then
                    log(nil, "[WARNING] Parameter missing from clipboard: " .. key)
                    goto __continue57
                end
                local savedValue = settings[key]
                if type(savedValue) ~= "number" then
                    log(
                        nil,
                        (("[WARNING] Clipboard parameter \"" .. key) .. "\" does not contain a number: ") .. inspect(savedValue)
                    )
                    goto __continue57
                end
                setParam(nil, key, savedValue)
            end
            ::__continue57::
        end
    end
    local function paramCheckbox(self, key, label)
        local param = themeParams[key]
        local currentValue = math.floor((param and param.currentValue or 0) + 0.5)
        local newValue = ctx:checkbox(label, currentValue == 1)
        if param then
            setParam(nil, key, newValue)
        end
    end
    local function paramSlider(self, key, opt)
        local param = themeParams[key]
        local currentValue = math.floor((param and param.currentValue or 0) + 0.5)
        local minValue = math.floor((opt and opt.min or param and param.minValue or 0) + 0.5)
        local maxValue = math.floor((opt and opt.max or param and param.maxValue or 1) + 0.5)
        local format = opt and opt.format or "%d"
        local newValue = math.floor(ctx:slider(
            key,
            currentValue,
            minValue,
            maxValue,
            1,
            format
        ) + 0.5)
        hint(nil, "Shift-click sliders to type in numbers manually")
        if param then
            setParam(nil, key, newValue)
        end
    end
    local PARAM_RESET_WIDTH = 24
    local function paramReset(self, key)
        local param = themeParams[key]
        ctx:pushId("param-reset-" .. key)
        local clicked = ctx:button("R")
        ctx:popId()
        if clicked and param then
            setParam(nil, key, param.defaultValue)
        end
    end
    microUILoop(
        nil,
        ctx,
        function(____, stop)
            hintText = ""
            if themeHasChanged(nil) then
                themeParams = getThemeParameters(nil)
            end
            local someThemeParamsMissing = __TS__ArraySome(
                __TS__ObjectValues(P),
                function(____, name) return not (themeParams[name] ~= nil) end
            )
            local hasVersionParam = themeParams[P.VERSION] ~= nil
            local ____opt_15 = themeParams[P.VERSION]
            local scriptVersionMatchesTheme = (____opt_15 and ____opt_15.currentValue) == THEME_VERSION
            if ctx:beginWindow("Demo Window", {x = 0, y = 0, w = 0, h = 0}, Option.NoResize | Option.NoTitle | Option.NoClose) then
                do
                    local win = ctx:getCurrentContainer()
                    win.rect.w = gfx.w
                    win.rect.h = gfx.h
                end
                if not scriptVersionMatchesTheme then
                    local oldFont = ctx.style.font
                    ctx.style.font = 2
                    ctx:layoutRow({-1}, 0)
                    if hasVersionParam then
                        local ____ctx_text_19 = ctx.text
                        local ____opt_17 = themeParams[P.VERSION]
                        ____ctx_text_19(
                            ctx,
                            ((("ERROR: The theme's version (" .. tostring(____opt_17 and ____opt_17.currentValue)) .. ") does not match this script's version (") .. tostring(THEME_VERSION)) .. ")"
                        )
                        ctx:text("Please make sure both the theme and script are up to date.")
                    else
                        ctx:text("ERROR: This adjuster script does not support the current theme.")
                        ctx:text("Please load the 80gray theme to adjust its settings.")
                    end
                    ctx.style.font = oldFont
                    return ctx:endWindow()
                end
                if someThemeParamsMissing then
                    ctx:layoutRow({-1}, 16)
                    ctx:layoutNext()
                    local oldFont = ctx.style.font
                    ctx.style.font = 2
                    ctx:layoutRow({-1}, 0)
                    ctx:text("WARNING: Some theme parameters are not found, this script may not work correctly!")
                    ctx:layoutRow({-1}, 16)
                    ctx:layoutNext()
                    ctx:layoutRow({-1}, 0)
                    ctx:text("Please contact the developer about this error!")
                    ctx.style.font = oldFont
                    ctx:layoutRow({-1}, 16)
                    ctx:layoutNext()
                end
                ctx:layoutRow({-1}, 0)
                activeTab = tabsWidget(
                    nil,
                    ctx,
                    "tabs",
                    {Tabs.General, Tabs.TCP, Tabs.MCP, Tabs.Transport},
                    activeTab
                )
                ctx:layoutRow({-1}, -50)
                ctx:beginPanel("tab-contents-" .. activeTab)
                local oldPanelBG = ctx.style.colors[ColorId.PanelBG]
                ctx.style.colors[ColorId.PanelBG] = rgba(
                    nil,
                    45,
                    45,
                    45,
                    1
                )
                repeat
                    local ____switch80 = activeTab
                    local ____cond80 = ____switch80 == Tabs.General
                    if ____cond80 then
                        do
                            ctx:layoutRow({-1}, 0)
                            local r = ctx:layoutNext()
                            ctx:layoutSetNext(r, false)
                            ctx:label("General settings")
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Color adjustment:")
                            ctx:layoutRow({-1}, 180)
                            ctx:beginPanel("color-adjust")
                            do
                                ctx:layoutRow({80, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Tint")
                                paramSlider(nil, P.NATIVE_TINT, {format = "%d"})
                                paramReset(nil, P.NATIVE_TINT)
                                ctx:label("Saturation")
                                paramSlider(nil, P.NATIVE_SATURATION, {format = "%d"})
                                paramReset(nil, P.NATIVE_SATURATION)
                                ctx:label("Highlight BG")
                                paramSlider(nil, P.NATIVE_HIGHLIGHT_BG, {format = "%d"})
                                paramReset(nil, P.NATIVE_HIGHLIGHT_BG)
                                ctx:label("Midtone BG")
                                paramSlider(nil, P.NATIVE_MIDTONE_BG, {format = "%d"})
                                paramReset(nil, P.NATIVE_MIDTONE_BG)
                                ctx:label("Shadow BG")
                                paramSlider(nil, P.NATIVE_SHADOW_BG, {format = "%d"})
                                paramReset(nil, P.NATIVE_SHADOW_BG)
                                ctx:label("Gamma")
                                paramSlider(nil, P.NATIVE_GAMMA, {format = "%d"})
                                paramReset(nil, P.NATIVE_GAMMA)
                                ctx:layoutRow({-1}, 0)
                                paramCheckbox(nil, P.NATIVE_COLOR_APPLY_ALL, "Also affect project custom colors")
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Scale fonts:")
                            ctx:layoutRow({-PARAM_RESET_WIDTH, -1}, 0)
                            paramSlider(nil, P.SCALE_FONT, {format = "%d%%"})
                            paramReset(nil, P.SCALE_FONT)
                            break
                        end
                    end
                    ____cond80 = ____cond80 or ____switch80 == Tabs.TCP
                    if ____cond80 then
                        do
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Track panel settings")
                            ctx:layoutRow({-1}, 0)
                            ctx:label("General settings:")
                            ctx:layoutRow({-1}, 56)
                            ctx:beginPanel("general")
                            do
                                ctx:layoutRow({-1}, 0)
                                paramCheckbox(nil, P.TCP_SINGLE_ROW_PAN_IO, "Show pan and routing controls in single row mode")
                                hint(nil, "\"single row\": When track is too short to show 2nd row of buttons")
                                paramCheckbox(nil, P.TCP_PERMANENT_REC_SECTION, "Always show extra recording buttons (monitor, input FX)")
                                hint(nil, "Show 'input monitor' and 'input FX' even when not armed")
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("FX list:")
                            ctx:layoutRow({-1}, 56)
                            ctx:beginPanel("fxlist")
                            do
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Width")
                                paramSlider(nil, P.TCP_FXLIST_WIDTH, {format = "%d px"})
                                paramReset(nil, P.TCP_FXLIST_WIDTH)
                                ctx:label("Columns")
                                paramSlider(nil, P.TCP_FXLIST_COLUMNS, {format = "%d columns"})
                                paramReset(nil, P.TCP_FXLIST_COLUMNS)
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Meter:")
                            ctx:layoutRow({-1}, 129)
                            ctx:beginPanel("meter")
                            do
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Width")
                                paramSlider(nil, P.TCP_METER_WIDTH, {format = "%d px"})
                                paramReset(nil, P.TCP_METER_WIDTH)
                                ctx:layoutRow({-1}, 0)
                                ctx:label("Show dB scales...")
                                paramCheckbox(nil, P.TCP_METER_TEXT_IN_BG, "In background")
                                paramCheckbox(nil, P.TCP_METER_TEXT_IN_FG, "On top of meters")
                                paramCheckbox(nil, P.TCP_METER_TEXT_ONLY_IF_TALL, "...Only if the panel is tall enough")
                                hint(nil, "\"tall enough\": When the panel shows more than 2 rows")
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Selection indicator:")
                            ctx:layoutRow({-1}, 57)
                            ctx:beginPanel("selection-indicator")
                            do
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Width:")
                                paramSlider(nil, P.TCP_INDICATOR_WIDTH, {format = "%d px"})
                                paramReset(nil, P.TCP_INDICATOR_WIDTH)
                                ctx:layoutRow({-1}, 0)
                                paramCheckbox(nil, P.TCP_INDICATOR_SHOW_RECARM, "Show record-armed status")
                                hint(nil, "Tracks armed for recording will use different colors")
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Tweaks:")
                            ctx:layoutRow({-1}, 202)
                            ctx:beginPanel("tweaks")
                            do
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Tint")
                                paramSlider(nil, P.TCP_TINT, {format = "%d %%"})
                                hint(nil, "Make the background color more similar to the track's custom color")
                                paramReset(nil, P.TCP_TINT)
                                ctx:layoutRow({-1}, 0)
                                paramCheckbox(nil, P.TCP_HIGH_CONTRAST, "Higher contrast text")
                                paramCheckbox(nil, P.TCP_NO_FADE, "Disable text fade-out effect")
                                paramCheckbox(nil, P.TCP_HORIZONTAL_TEXT_HACK, "[Hack] Force text to be horizontal")
                                hint(nil, "Doesn't work on some systems (just makes text disappear)")
                                ctx:layoutRow({-1}, 0)
                                ctx:label("Limit width of record-input text:")
                                ctx:layoutRow({-PARAM_RESET_WIDTH, -1}, 0)
                                paramSlider(nil, P.TCP_MAX_RECINPUT_WIDTH, {format = "%d px"})
                                paramReset(nil, P.TCP_MAX_RECINPUT_WIDTH)
                                ctx:layoutRow({-1}, 0)
                                ctx:label("FX parameters column width:")
                                ctx:layoutRow({-PARAM_RESET_WIDTH, -1}, 0)
                                paramSlider(nil, P.TCP_FXPARM_COL_WIDTH, {format = "%d px"})
                                paramReset(nil, P.TCP_FXPARM_COL_WIDTH)
                            end
                            ctx:endPanel()
                            break
                        end
                    end
                    ____cond80 = ____cond80 or ____switch80 == Tabs.MCP
                    if ____cond80 then
                        do
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Mixer panel settings")
                            ctx:layoutRow({-1}, 0)
                            ctx:label("General settings:")
                            ctx:layoutRow({-1}, 152)
                            ctx:beginPanel("general")
                            do
                                ctx:layoutRow({-1}, 0)
                                ctx:label("Panel width:")
                                ctx:layoutRow({-PARAM_RESET_WIDTH, -1}, 0)
                                paramSlider(nil, P.MCP_WIDTH, {format = "%d px"})
                                paramReset(nil, P.MCP_WIDTH)
                                ctx:layoutRow({-1}, 0)
                                ctx:label("Master panel width:")
                                ctx:layoutRow({-PARAM_RESET_WIDTH, -1}, 0)
                                paramSlider(nil, P.MASTER_MCP_WIDTH, {format = "%d px"})
                                paramReset(nil, P.MASTER_MCP_WIDTH)
                                ctx:layoutRow({-1}, 0)
                                ctx:label("Folder indent:")
                                ctx:layoutRow({-PARAM_RESET_WIDTH, -1}, 0)
                                paramSlider(nil, P.MCP_FOLDER_INDENT, {format = "%d px"})
                                paramReset(nil, P.MCP_FOLDER_INDENT)
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Meter:")
                            ctx:layoutRow({-1}, 82)
                            ctx:beginPanel("meter")
                            do
                                ctx:layoutRow({-1}, 0)
                                ctx:label("Show dB scales...")
                                paramCheckbox(nil, P.MCP_METER_TEXT_IN_BG, "In background")
                                paramCheckbox(nil, P.MCP_METER_TEXT_IN_FG, "On top of meters")
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Selection indicator:")
                            ctx:layoutRow({-1}, 57)
                            ctx:beginPanel("selection-indicator")
                            do
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Width:")
                                paramSlider(nil, P.MCP_INDICATOR_WIDTH, {format = "%d px"})
                                paramReset(nil, P.MCP_INDICATOR_WIDTH)
                                ctx:layoutRow({-1}, 0)
                                paramCheckbox(nil, P.MCP_INDICATOR_SHOW_RECARM, "Show record-armed status")
                                hint(nil, "Tracks armed for recording will use different colors")
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Routing diagram:")
                            ctx:layoutRow({-1}, 110)
                            ctx:beginPanel("routing-diagram")
                            do
                                ctx:layoutRow({-1}, 0)
                                ctx:label("Height:")
                                ctx:layoutRow({-PARAM_RESET_WIDTH, -1}, 0)
                                paramSlider(nil, P.MCP_DIAGRAM_HEIGHT, {format = "%d px"})
                                paramReset(nil, P.MCP_DIAGRAM_HEIGHT)
                                ctx:layoutRow({-1}, 0)
                                ctx:label("Max rows displayed in diagram:")
                                ctx:layoutRow({-PARAM_RESET_WIDTH, -1}, 0)
                                paramSlider(nil, P.MCP_DIAGRAM_MAX_ROWS, {format = "%d rows"})
                                paramReset(nil, P.MCP_DIAGRAM_MAX_ROWS)
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Tweaks:")
                            ctx:layoutRow({-1}, 35)
                            ctx:beginPanel("tweaks")
                            do
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Tint")
                                paramSlider(nil, P.MCP_TINT, {format = "%d %%"})
                                hint(nil, "Make the background color more similar to the track's custom color")
                                paramReset(nil, P.MCP_TINT)
                            end
                            ctx:endPanel()
                            break
                        end
                    end
                    ____cond80 = ____cond80 or ____switch80 == Tabs.Transport
                    if ____cond80 then
                        do
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Transport settings")
                            ctx:layoutRow({-1}, 0)
                            ctx:label("General settings:")
                            ctx:layoutRow({-1}, 56)
                            ctx:beginPanel("general")
                            do
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Height")
                                paramSlider(nil, P.TRANS_HEIGHT, {format = "%d px"})
                                paramReset(nil, P.TRANS_HEIGHT)
                                ctx:layoutRow({-1}, 0)
                                paramCheckbox(nil, P.TRANS_SHOW_PAUSE_BUTTON, "Show pause button")
                            end
                            ctx:endPanel()
                            ctx:layoutRow({-1}, 0)
                            ctx:label("Selection diagram:")
                            ctx:layoutRow({-1}, 160)
                            ctx:beginPanel("general")
                            do
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Width")
                                paramSlider(nil, P.TRANS_SEL_W, {format = "%d px"})
                                paramReset(nil, P.TRANS_SEL_W)
                                ctx:label("Height")
                                paramSlider(nil, P.TRANS_SEL_H, {format = "%d px"})
                                paramReset(nil, P.TRANS_SEL_H)
                                ctx:label("Text height")
                                paramSlider(nil, P.TRANS_SEL_TEXT_H, {format = "%d px"})
                                paramReset(nil, P.TRANS_SEL_TEXT_H)
                                ctx:layoutRow({-1}, 4)
                                ctx:layoutNext()
                                ctx:layoutRow({-1}, 0)
                                ctx:text("If the diagram shows some clipping text on the left side, please adjust the following clip length to fix it:")
                                ctx:layoutRow({-1}, 4)
                                ctx:layoutNext()
                                ctx:layoutRow({60, -PARAM_RESET_WIDTH, -1}, 0)
                                ctx:label("Clip left")
                                paramSlider(nil, P.TRANS_SEL_LABEL_W, {format = "%d px"})
                                paramReset(nil, P.TRANS_SEL_LABEL_W)
                            end
                            ctx:endPanel()
                            break
                        end
                    end
                    do
                        assertUnreachable(nil, activeTab)
                    end
                until true
                ctx.style.colors[ColorId.PanelBG] = oldPanelBG
                ctx:endPanel()
                do
                    local versionText = ("v" .. tostring(THEME_VERSION / 100)) .. " - kotll / jisai"
                    local versionWidth = ctx:textWidth(ctx.style.font, versionText)
                    local anchorRight = -versionWidth - ctx.style.spacing * 2
                    local buttonWidth = 80
                    ctx:layoutRow({buttonWidth, buttonWidth, anchorRight, -1}, 0)
                    if ctx:button("Copy all") then
                        local settings = serialiseSettings(nil)
                        copy(nil, settings)
                    end
                    hint(nil, "Copy all theme settings to clipboard (Needs SWS extensions)")
                    if ctx:button("Paste all") then
                        local settings = paste(nil)
                        do
                            local function ____catch(____error)
                                log(nil, "Failed to apply settings from clipboard due to the following error:")
                                processError(nil, ____error):print()
                            end
                            local ____try, ____hasReturned = pcall(function()
                                applySettings(nil, settings)
                            end)
                            if not ____try then
                                ____catch(____hasReturned)
                            end
                        end
                    end
                    hint(nil, "Paste all theme settings from clipboard (Needs SWS extensions)")
                    ctx:layoutNext()
                    ctx:label(versionText)
                    ctx:layoutRow({-1}, 0)
                    ctx:label(hintText)
                end
                if needLayoutRefresh then
                    reaper.ThemeLayout_RefreshAll()
                    needLayoutRefresh = false
                end
                ctx:endWindow()
            end
        end,
        function()
            local wnd = getWindowInfo(nil)
            config.windowDock = wnd.dock
            config.windowX = wnd.x
            config.windowY = wnd.y
            config.windowW = wnd.w
            config.windowH = wnd.h
            config.activeTab = activeTab
        end
    )
end
errorHandler(nil, main)
return ____exports
 end,
["lua_modules.reaper-microui.build.index"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__StringSlice = ____lualib.__TS__StringSlice
local __TS__New = ____lualib.__TS__New
local __TS__ArraySetLength = ____lualib.__TS__ArraySetLength
local __TS__Iterator = ____lualib.__TS__Iterator
local ____exports = {}
local ____ffi = require("lua_modules.reaper-microui.node_modules.reaper-api.ffi.index")
local DrawStrFlags = ____ffi.DrawStrFlags
local Mode = ____ffi.Mode
local MouseCap = ____ffi.MouseCap
local ____utils = require("lua_modules.reaper-microui.node_modules.reaper-api.utils")
local deferLoop = ____utils.deferLoop
local log = ____utils.log
local ____ui = require("lua_modules.reaper-microui.build.ui")
local ColorId = ____ui.ColorId
local CommandType = ____ui.CommandType
local Context = ____ui.Context
local createDefaultStyle = ____ui.createDefaultStyle
local IconId = ____ui.IconId
local Key = ____ui.Key
local MouseButton = ____ui.MouseButton
local Option = ____ui.Option
local Response = ____ui.Response
do
    local ____export = require("lua_modules.reaper-microui.build.ui")
    for ____exportKey, ____exportValue in pairs(____export) do
        if ____exportKey ~= "default" then
            ____exports[____exportKey] = ____exportValue
        end
    end
end
--- Create a new microUI context.
-- 
-- You must run gfx.init and gfx.setfont before calling this. E.g.:
-- 
--     gfx.init("My window", 260, 450);
--     gfx.setfont(1, "Arial", 12);
-- 
-- Afterwards, use {@link microUILoop} to run the main GUI loop.
function ____exports.createContext(self)
    return __TS__New(
        Context,
        function(____, font, str, len)
            if len ~= nil then
                str = __TS__StringSlice(str, 0, len)
            end
            gfx.setfont(font)
            local width, _ = gfx.measurestr(str)
            return width
        end,
        function(____, font)
            gfx.setfont(font)
            return gfx.texth
        end,
        createDefaultStyle(nil, 0)
    )
end
--- Main loop for a microUI GUI. Use {@link createContext} to create a context first.
-- 
-- Example code:
-- - {@link demoSimple}
-- - {@link demoSingleWindow}
-- - {@link demoMultiWindow}
function ____exports.microUILoop(self, ctx, func, cleanup)
    local downKeys = {
        left = false,
        middle = false,
        right = false,
        shift = false,
        ctrl = false,
        alt = false,
        backspace = false,
        ["return"] = false
    }
    local downChars = {}
    deferLoop(
        nil,
        function(____, stop)
            do
                downKeys.backspace = false
                downKeys["return"] = false
                __TS__ArraySetLength(downChars, 0)
                while true do
                    do
                        local char = gfx.getchar()
                        if char == -1 then
                            return stop(nil)
                        end
                        if char == 0 then
                            break
                        end
                        if char == 8 then
                            downKeys.backspace = true
                            goto __continue9
                        elseif char == 13 then
                            downKeys["return"] = true
                            goto __continue9
                        end
                        local isUnicode = char >> 24 == 117
                        if isUnicode then
                            local unicodeChar = char & 16777215
                            downChars[#downChars + 1] = utf8.char(unicodeChar)
                            goto __continue9
                        end
                        if 32 <= char and char <= 126 then
                            downChars[#downChars + 1] = utf8.char(char)
                            goto __continue9
                        end
                    end
                    ::__continue9::
                end
                if downKeys.shift then
                    ctx:inputScroll(-gfx.mouse_wheel * 0.3, gfx.mouse_hwheel * 0.3)
                else
                    ctx:inputScroll(gfx.mouse_hwheel * 0.3, -gfx.mouse_wheel * 0.3)
                end
                gfx.mouse_wheel = 0
                gfx.mouse_hwheel = 0
                ctx:inputMouseMove(gfx.mouse_x, gfx.mouse_y)
                downKeys.left = gfx.mouse_cap & MouseCap.LeftMouse ~= 0
                downKeys.middle = gfx.mouse_cap & MouseCap.MiddleMouse ~= 0
                downKeys.right = gfx.mouse_cap & MouseCap.RightMouse ~= 0
                downKeys.ctrl = gfx.mouse_cap & MouseCap.CommandKey ~= 0
                downKeys.alt = gfx.mouse_cap & MouseCap.OptionKey ~= 0
                downKeys.shift = gfx.mouse_cap & MouseCap.ShiftKey ~= 0
                ctx:inputMouseContinuous((downKeys.left and MouseButton.Left or 0) | (downKeys.middle and MouseButton.Middle or 0) | (downKeys.right and MouseButton.Right or 0))
                ctx:inputKeyContinuous((downKeys.alt and Key.Alt or 0) | (downKeys.backspace and Key.Backspace or 0) | (downKeys.ctrl and Key.Ctrl or 0) | (downKeys["return"] and Key.Return or 0) | (downKeys.shift and Key.Shift or 0))
                ctx:inputText(table.concat(downChars, ""))
            end
            ctx:begin()
            func(nil, stop)
            ctx["end"](ctx)
            local currentClip = nil
            for ____, cmd in __TS__Iterator(ctx:iterCommands()) do
                repeat
                    local ____switch19 = cmd.type
                    local ____cond19 = ____switch19 == CommandType.Clip
                    if ____cond19 then
                        do
                            currentClip = cmd.rect
                            break
                        end
                    end
                    ____cond19 = ____cond19 or ____switch19 == CommandType.Rect
                    if ____cond19 then
                        do
                            gfx.r = cmd.color.r / 255
                            gfx.g = cmd.color.g / 255
                            gfx.b = cmd.color.b / 255
                            gfx.a = cmd.color.a / 255
                            gfx.rect(cmd.rect.x, cmd.rect.y, cmd.rect.w, cmd.rect.h)
                            break
                        end
                    end
                    ____cond19 = ____cond19 or ____switch19 == CommandType.Text
                    if ____cond19 then
                        do
                            gfx.r = cmd.color.r / 255
                            gfx.g = cmd.color.g / 255
                            gfx.b = cmd.color.b / 255
                            gfx.a = cmd.color.a / 255
                            gfx.x = cmd.pos.x
                            gfx.y = cmd.pos.y
                            gfx.setfont(cmd.font)
                            if currentClip then
                                local width, height = gfx.measurestr(cmd.str)
                                width = width + 1
                                height = height + 1
                                local clipLeft = cmd.pos.x < currentClip.x
                                local clipRight = cmd.pos.x + width >= currentClip.x + currentClip.w
                                local clipTop = cmd.pos.y < currentClip.y
                                local clipBottom = cmd.pos.y + height >= currentClip.y + currentClip.h
                                if not clipLeft and not clipRight and not clipTop and not clipBottom then
                                    gfx.drawstr(cmd.str)
                                elseif not clipLeft and not clipTop then
                                    gfx.drawstr(cmd.str, 0, currentClip.x + currentClip.w, currentClip.y + currentClip.h)
                                else
                                    gfx.setimgdim(0, width, height)
                                    do
                                        gfx.r = cmd.color.r / 255
                                        gfx.g = cmd.color.g / 255
                                        gfx.b = cmd.color.b / 255
                                        gfx.a = 1
                                        gfx.a2 = 1
                                        gfx.mode = Mode.Default
                                        gfx.dest = 0
                                        gfx.rect(
                                            0,
                                            0,
                                            width,
                                            height,
                                            true
                                        )
                                        gfx.r = 0
                                        gfx.g = 0
                                        gfx.b = 0
                                        gfx.a = -1
                                        gfx.a2 = 1
                                        gfx.mode = Mode.AdditiveBlend
                                        gfx.dest = 0
                                        gfx.rect(
                                            0,
                                            0,
                                            width,
                                            height,
                                            true
                                        )
                                    end
                                    do
                                        gfx.r = 0
                                        gfx.g = 0
                                        gfx.b = 0
                                        gfx.a = 1
                                        gfx.a2 = cmd.color.a / 255
                                        gfx.mode = Mode.AdditiveBlend
                                        gfx.x = cmd.pos.x % 1
                                        gfx.y = cmd.pos.y % 1
                                        gfx.dest = 0
                                        gfx.drawstr(cmd.str, 0)
                                    end
                                    do
                                        gfx.x = 0
                                        gfx.y = 0
                                        gfx.a = 1
                                        gfx.dest = -1
                                        gfx.a2 = 1
                                        gfx.mode = Mode.Default
                                        gfx.blit(
                                            0,
                                            1,
                                            0,
                                            currentClip.x - cmd.pos.x + cmd.pos.x % 1,
                                            currentClip.y - cmd.pos.y + cmd.pos.y % 1,
                                            currentClip.w,
                                            currentClip.h,
                                            currentClip.x,
                                            currentClip.y
                                        )
                                    end
                                    do
                                        gfx.dest = -1
                                        gfx.a2 = 1
                                        gfx.mode = Mode.Default
                                    end
                                end
                            else
                                gfx.drawstr(cmd.str)
                            end
                            break
                        end
                    end
                    ____cond19 = ____cond19 or ____switch19 == CommandType.Icon
                    if ____cond19 then
                        do
                            gfx.r = cmd.color.r / 255
                            gfx.g = cmd.color.g / 255
                            gfx.b = cmd.color.b / 255
                            gfx.a = cmd.color.a / 255
                            gfx.x = cmd.rect.x
                            gfx.y = cmd.rect.y
                            repeat
                                local ____switch33 = cmd.id
                                local ____cond33 = ____switch33 == IconId.Close
                                if ____cond33 then
                                    do
                                        gfx.drawstr("✕", DrawStrFlags.CenterHorizontally | DrawStrFlags.CenterVertically, cmd.rect.x + cmd.rect.w, cmd.rect.y + cmd.rect.h)
                                        break
                                    end
                                end
                                ____cond33 = ____cond33 or ____switch33 == IconId.Check
                                if ____cond33 then
                                    do
                                        gfx.drawstr("✓", DrawStrFlags.CenterHorizontally | DrawStrFlags.CenterVertically, cmd.rect.x + cmd.rect.w, cmd.rect.y + cmd.rect.h)
                                        break
                                    end
                                end
                                ____cond33 = ____cond33 or ____switch33 == IconId.Collapsed
                                if ____cond33 then
                                    do
                                        gfx.drawstr("▸", DrawStrFlags.CenterHorizontally | DrawStrFlags.CenterVertically, cmd.rect.x + cmd.rect.w, cmd.rect.y + cmd.rect.h)
                                        break
                                    end
                                end
                                ____cond33 = ____cond33 or ____switch33 == IconId.Expanded
                                if ____cond33 then
                                    do
                                        gfx.drawstr("▾", DrawStrFlags.CenterHorizontally | DrawStrFlags.CenterVertically, cmd.rect.x + cmd.rect.w, cmd.rect.y + cmd.rect.h)
                                        break
                                    end
                                end
                                do
                                    error("unhandled icon type: " .. tostring(cmd))
                                end
                            until true
                            break
                        end
                    end
                    ____cond19 = ____cond19 or ____switch19 == CommandType.Custom
                    if ____cond19 then
                        do
                            cmd:draw(currentClip)
                            break
                        end
                    end
                    do
                        error("unhandled command type: " .. tostring(cmd))
                    end
                until true
            end
            gfx.update()
        end,
        cleanup
    )
end
function ____exports.demoMultiWindow(self)
    gfx.init("Test window", 500, 500)
    gfx.setfont(1, "Arial", 12)
    local ctx = ____exports.createContext(nil)
    ctx.style.font = 1
    local bgColor = {90, 95, 100}
    local checks = {true, false, true}
    local logWindowTextboxInput = ""
    local logWindowLogUpdated = false
    local logWindowLog = ""
    local function writeLog(self, text)
        if #logWindowLog > 0 then
            logWindowLog = logWindowLog .. "\n" .. text
        else
            logWindowLog = text
        end
        logWindowLogUpdated = true
    end
    local function logWindow(self, ctx)
        if ctx:beginWindow("Log Window", {x = 350, y = 40, w = 300, h = 200}) then
            ctx:layoutRow({-1}, -25)
            ctx:beginPanel("Log Output")
            local panel = ctx:getCurrentContainer()
            ctx:layoutRow({-1}, -1)
            ctx:text(logWindowLog)
            ctx:endPanel()
            if logWindowLogUpdated then
                panel.scroll.y = panel.contentSize.y
                logWindowLogUpdated = false
            end
            local submitted = false
            ctx:layoutRow({-70, -1}, 0)
            logWindowTextboxInput = ctx:textbox(
                "textbox",
                logWindowTextboxInput,
                Option.None,
                function(____, res)
                    if res and res & Response.Submit ~= 0 then
                        ctx:setFocus(ctx.lastId)
                        submitted = true
                    end
                end
            )
            if ctx:button("Submit") then
                submitted = true
            end
            if submitted then
                writeLog(nil, logWindowTextboxInput)
                logWindowTextboxInput = ""
            end
            ctx:endWindow()
        end
    end
    local function testWindow(self, ctx)
        if ctx:beginWindow("Demo Window", {x = 40, y = 40, w = 300, h = 450}) then
            local win = ctx:getCurrentContainer()
            win.rect.w = math.max(win.rect.w, 240)
            win.rect.h = math.max(win.rect.h, 240)
            if ctx:header("Window Info") then
                local win = ctx:getCurrentContainer()
                ctx:layoutRow({54, -1}, 0)
                ctx:label("Position:")
                ctx:label((tostring(win.rect.x) .. ", ") .. tostring(win.rect.y))
                ctx:label("Size:")
                ctx:label((tostring(win.rect.w) .. ", ") .. tostring(win.rect.h))
            end
            if ctx:header("Test Buttons", Option.Expanded) then
                ctx:layoutRow({86, -110, -1}, 0)
                ctx:label("Test buttons 1:")
                if ctx:button("Button 1") then
                    writeLog(nil, "Pressed button 1")
                end
                if ctx:button("Button 2") then
                    writeLog(nil, "Pressed button 2")
                end
                ctx:label("Test buttons 2:")
                if ctx:button("Button 3") then
                    writeLog(nil, "Pressed button 3")
                end
                if ctx:button("Popup") then
                    ctx:openPopup("Test Popup")
                end
                if ctx:beginPopup("Test Popup") then
                    ctx:button("Hello")
                    ctx:button("World")
                    ctx:endPopup()
                end
            end
            if ctx:header("Tree and Text", Option.Expanded) then
                ctx:layoutRow({140, -1}, 0)
                ctx:layoutBeginColumn()
                if ctx:beginTreenode("Test 1") then
                    if ctx:beginTreenode("Test 1a") then
                        ctx:label("Hello")
                        ctx:label("world")
                        ctx:endTreenode()
                    end
                    if ctx:beginTreenode("Test 1b") then
                        if ctx:button("Button 1") then
                            writeLog(nil, "Pressed button 1")
                        end
                        if ctx:button("Button 2") then
                            writeLog(nil, "Pressed button 2")
                        end
                        ctx:endTreenode()
                    end
                    ctx:endTreenode()
                end
                if ctx:beginTreenode("Test 2") then
                    ctx:layoutRow({54, 54}, 0)
                    if ctx:button("Button 3") then
                        writeLog(nil, "Pressed button 3")
                    end
                    if ctx:button("Button 4") then
                        writeLog(nil, "Pressed button 4")
                    end
                    if ctx:button("Button 5") then
                        writeLog(nil, "Pressed button 5")
                    end
                    if ctx:button("Button 6") then
                        writeLog(nil, "Pressed button 6")
                    end
                    ctx:endTreenode()
                end
                if ctx:beginTreenode("Test 3") then
                    checks[1] = ctx:checkbox("Checkbox 1", checks[1])
                    checks[2] = ctx:checkbox("Checkbox 2", checks[2])
                    checks[3] = ctx:checkbox("Checkbox 3", checks[3])
                    ctx:endTreenode()
                end
                ctx:layoutEndColumn()
                ctx:layoutBeginColumn()
                ctx:layoutRow({-1}, 0)
                ctx:text(("Lorem ipsum dolor sit amet, consectetur adipiscing " .. "elit. Maecenas lacinia, sem eu lacinia molestie, mi risus faucibus ") .. "ipsum, eu varius magna felis a nulla.")
                ctx:layoutEndColumn()
            end
            if ctx:header("Background Color", Option.Expanded) then
                ctx:layoutRow({-78, -1}, 74)
                ctx:layoutBeginColumn()
                ctx:layoutRow({46, -1}, 0)
                ctx:label("Red:")
                bgColor[1] = math.floor(ctx:slider("bgColor[0]", bgColor[1], 0, 255))
                ctx:label("Green:")
                bgColor[2] = math.floor(ctx:slider("bgColor[1]", bgColor[2], 0, 255))
                ctx:label("Blue:")
                bgColor[3] = math.floor(ctx:slider("bgColor[2]", bgColor[3], 0, 255))
                ctx:layoutEndColumn()
                local r = ctx:layoutNext()
                ctx:drawRect(r, {r = bgColor[1], g = bgColor[2], b = bgColor[3], a = 255})
                ctx:drawControlText(
                    string.format("#%02X%02X%02X", bgColor[1], bgColor[2], bgColor[3]),
                    r,
                    ColorId.Text,
                    Option.AlignCenter
                )
            end
            ctx:endWindow()
        end
    end
    local function uint8Slider(self, ctx, name, value, low, high)
        local res = ctx:slider(
            name,
            value,
            low,
            high,
            0,
            "%.0f",
            Option.AlignCenter
        )
        return math.floor(res)
    end
    local styleWindowFields = {
        {"text:", ColorId.Text},
        {"border:", ColorId.Border},
        {"windowbg:", ColorId.WindowBG},
        {"titlebg:", ColorId.TitleBG},
        {"titletext:", ColorId.TitleText},
        {"panelbg:", ColorId.PanelBG},
        {"button:", ColorId.Button},
        {"buttonhover:", ColorId.ButtonHover},
        {"buttonfocus:", ColorId.ButtonFocus},
        {"base:", ColorId.Base},
        {"basehover:", ColorId.BaseHover},
        {"basefocus:", ColorId.BaseFocus},
        {"scrollbase:", ColorId.ScrollBase},
        {"scrollthumb:", ColorId.ScrollThumb}
    }
    local function styleWindow(self, ctx)
        if ctx:beginWindow("Style Editor", {x = 350, y = 250, w = 300, h = 240}) then
            local sw = ctx:getCurrentContainer().body.w * 0.14
            ctx:layoutRow({
                80,
                sw,
                sw,
                sw,
                sw,
                -1
            }, 0)
            do
                local i = 0
                while i < #styleWindowFields do
                    local label, colorId = table.unpack(styleWindowFields[i + 1])
                    ctx:label(label)
                    ctx.style.colors[colorId].r = uint8Slider(
                        nil,
                        ctx,
                        label .. "!r",
                        ctx.style.colors[colorId].r,
                        0,
                        255
                    )
                    ctx.style.colors[colorId].g = uint8Slider(
                        nil,
                        ctx,
                        label .. "!g",
                        ctx.style.colors[colorId].g,
                        0,
                        255
                    )
                    ctx.style.colors[colorId].b = uint8Slider(
                        nil,
                        ctx,
                        label .. "!b",
                        ctx.style.colors[colorId].b,
                        0,
                        255
                    )
                    ctx.style.colors[colorId].a = uint8Slider(
                        nil,
                        ctx,
                        label .. "!a",
                        ctx.style.colors[colorId].a,
                        0,
                        255
                    )
                    ctx:drawRect(
                        ctx:layoutNext(),
                        ctx.style.colors[colorId]
                    )
                    i = i + 1
                end
            end
            ctx:endWindow()
        end
    end
    ____exports.microUILoop(
        nil,
        ctx,
        function()
            styleWindow(nil, ctx)
            logWindow(nil, ctx)
            testWindow(nil, ctx)
            gfx.clear = bgColor[1] + bgColor[2] * 256 + bgColor[3] * 65536
        end
    )
end
function ____exports.demoSingleWindow(self)
    gfx.init("80gray Theme Adjuster", 260, 450)
    gfx.setfont(1, "Arial", 12)
    local ctx = ____exports.createContext(nil)
    ctx.style.font = 1
    local bgColor = {90, 95, 100}
    local checks = {true, false, true}
    ____exports.microUILoop(
        nil,
        ctx,
        function()
            if ctx:beginWindow("Demo Window", {x = 0, y = 0, w = 0, h = 0}, Option.NoResize | Option.NoTitle | Option.NoClose) then
                local win = ctx:getCurrentContainer()
                win.rect.w = gfx.w
                win.rect.h = gfx.h
                if ctx:header("Window Info") then
                    local win = ctx:getCurrentContainer()
                    ctx:layoutRow({54, -1}, 0)
                    ctx:label("Position:")
                    ctx:label((tostring(win.rect.x) .. ", ") .. tostring(win.rect.y))
                    ctx:label("Size:")
                    ctx:label((tostring(win.rect.w) .. ", ") .. tostring(win.rect.h))
                end
                if ctx:header("Test Buttons", Option.Expanded) then
                    ctx:layoutRow({86, -110, -1}, 0)
                    ctx:label("Test buttons 1:")
                    if ctx:button("Button 1") then
                        log(nil, "Pressed button 1")
                    end
                    if ctx:button("Button 2") then
                        log(nil, "Pressed button 2")
                    end
                    ctx:label("Test buttons 2:")
                    if ctx:button("Button 3") then
                        log(nil, "Pressed button 3")
                    end
                    if ctx:button("Popup") then
                        ctx:openPopup("Test Popup")
                    end
                    if ctx:beginPopup("Test Popup") then
                        ctx:button("Hello")
                        ctx:button("World")
                        ctx:endPopup()
                    end
                end
                if ctx:header("Tree and Text", Option.Expanded) then
                    ctx:layoutRow({140, -1}, 0)
                    ctx:layoutBeginColumn()
                    if ctx:beginTreenode("Test 1") then
                        if ctx:beginTreenode("Test 1a") then
                            ctx:label("Hello")
                            ctx:label("world")
                            ctx:endTreenode()
                        end
                        if ctx:beginTreenode("Test 1b") then
                            if ctx:button("Button 1") then
                                log(nil, "Pressed button 1")
                            end
                            if ctx:button("Button 2") then
                                log(nil, "Pressed button 2")
                            end
                            ctx:endTreenode()
                        end
                        ctx:endTreenode()
                    end
                    if ctx:beginTreenode("Test 2") then
                        ctx:layoutRow({54, 54}, 0)
                        if ctx:button("Button 3") then
                            log(nil, "Pressed button 3")
                        end
                        if ctx:button("Button 4") then
                            log(nil, "Pressed button 4")
                        end
                        if ctx:button("Button 5") then
                            log(nil, "Pressed button 5")
                        end
                        if ctx:button("Button 6") then
                            log(nil, "Pressed button 6")
                        end
                        ctx:endTreenode()
                    end
                    if ctx:beginTreenode("Test 3") then
                        checks[1] = ctx:checkbox("Checkbox 1", checks[1])
                        checks[2] = ctx:checkbox("Checkbox 2", checks[2])
                        checks[3] = ctx:checkbox("Checkbox 3", checks[3])
                        ctx:endTreenode()
                    end
                    ctx:layoutEndColumn()
                    ctx:layoutBeginColumn()
                    ctx:layoutRow({-1}, 0)
                    ctx:text(("Lorem ipsum dolor sit amet, consectetur adipiscing " .. "elit. Maecenas lacinia, sem eu lacinia molestie, mi risus faucibus ") .. "ipsum, eu varius magna felis a nulla.")
                    ctx:layoutEndColumn()
                end
                if ctx:header("Background Color", Option.Expanded) then
                    ctx:layoutRow({-78, -1}, 74)
                    ctx:layoutBeginColumn()
                    ctx:layoutRow({46, -1}, 0)
                    ctx:label("Red:")
                    bgColor[1] = math.floor(ctx:slider("bgColor[0]", bgColor[1], 0, 255))
                    ctx:label("Green:")
                    bgColor[2] = math.floor(ctx:slider("bgColor[1]", bgColor[2], 0, 255))
                    ctx:label("Blue:")
                    bgColor[3] = math.floor(ctx:slider("bgColor[2]", bgColor[3], 0, 255))
                    ctx:layoutEndColumn()
                    local r = ctx:layoutNext()
                    ctx:drawRect(r, {r = bgColor[1], g = bgColor[2], b = bgColor[3], a = 255})
                    ctx:drawControlText(
                        string.format("#%02X%02X%02X", bgColor[1], bgColor[2], bgColor[3]),
                        r,
                        ColorId.Text,
                        Option.AlignCenter
                    )
                end
                ctx:endWindow()
            end
            gfx.clear = bgColor[1] + bgColor[2] * 256 + bgColor[3] * 65536
        end
    )
end
function ____exports.demoSimple(self)
    gfx.init("My Window", 260, 450)
    gfx.setfont(1, "Arial", 12)
    local ctx = ____exports.createContext(nil)
    ctx.style.font = 1
    local checks = {true, false, true}
    ____exports.microUILoop(
        nil,
        ctx,
        function()
            if ctx:beginWindow("Demo Window", {x = 0, y = 0, w = 0, h = 0}, Option.NoResize | Option.NoTitle | Option.NoClose) then
                local win = ctx:getCurrentContainer()
                win.rect.w = gfx.w
                win.rect.h = gfx.h
                if ctx:header("Window Info") then
                    local win = ctx:getCurrentContainer()
                    ctx:layoutRow({54, -1}, 0)
                    ctx:label("Position:")
                    ctx:label((tostring(win.rect.x) .. ", ") .. tostring(win.rect.y))
                    ctx:label("Size:")
                    ctx:label((tostring(win.rect.w) .. ", ") .. tostring(win.rect.h))
                end
                if ctx:header("Test Buttons", Option.Expanded) then
                    ctx:layoutRow({86, -110, -1}, 0)
                    ctx:label("Test buttons 1:")
                    if ctx:button("Button 1") then
                        log(nil, "Pressed button 1")
                    end
                    if ctx:button("Button 2") then
                        log(nil, "Pressed button 2")
                    end
                    ctx:label("Test buttons 2:")
                    if ctx:button("Button 3") then
                        log(nil, "Pressed button 3")
                    end
                    if ctx:button("Popup") then
                        ctx:openPopup("Test Popup")
                    end
                    if ctx:beginPopup("Test Popup") then
                        ctx:button("Hello")
                        ctx:button("World")
                        ctx:endPopup()
                    end
                end
                if ctx:header("Tree and Text", Option.Expanded) then
                    ctx:layoutRow({140, -1}, 0)
                    ctx:layoutBeginColumn()
                    if ctx:beginTreenode("Test 1") then
                        if ctx:beginTreenode("Test 1a") then
                            ctx:label("Hello")
                            ctx:label("world")
                            ctx:endTreenode()
                        end
                        if ctx:beginTreenode("Test 1b") then
                            if ctx:button("Button 1") then
                                log(nil, "Pressed button 1")
                            end
                            if ctx:button("Button 2") then
                                log(nil, "Pressed button 2")
                            end
                            ctx:endTreenode()
                        end
                        ctx:endTreenode()
                    end
                    if ctx:beginTreenode("Test 2") then
                        checks[1] = ctx:checkbox("Checkbox 1", checks[1])
                        checks[2] = ctx:checkbox("Checkbox 2", checks[2])
                        checks[3] = ctx:checkbox("Checkbox 3", checks[3])
                        ctx:endTreenode()
                    end
                    ctx:layoutEndColumn()
                    ctx:layoutBeginColumn()
                    ctx:layoutRow({-1}, 0)
                    ctx:text(("Lorem ipsum dolor sit amet, consectetur adipiscing " .. "elit. Maecenas lacinia, sem eu lacinia molestie, mi risus faucibus ") .. "ipsum, eu varius magna felis a nulla.")
                    ctx:layoutEndColumn()
                end
                ctx:endWindow()
            end
        end
    )
end
return ____exports
 end,
["lua_modules.reaper-microui.build.ui"] = function(...) 
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__ObjectAssign = ____lualib.__TS__ObjectAssign
local __TS__ArraySort = ____lualib.__TS__ArraySort
local __TS__Generator = ____lualib.__TS__Generator
local __TS__Delete = ____lualib.__TS__Delete
local __TS__StringSlice = ____lualib.__TS__StringSlice
local __TS__ParseFloat = ____lualib.__TS__ParseFloat
local __TS__StringCharAt = ____lualib.__TS__StringCharAt
local ____exports = {}
local ____deepcopy = require("lua_modules.reaper-microui.build.deepcopy")
local deepcopy = ____deepcopy.deepcopy
local ____hash = require("lua_modules.reaper-microui.build.hash")
local HASH_INITIAL = ____hash.HASH_INITIAL
local hashString = ____hash.hashString
____exports.MouseButton = MouseButton or ({})
____exports.MouseButton.None = 0
____exports.MouseButton[____exports.MouseButton.None] = "None"
____exports.MouseButton.Left = 1
____exports.MouseButton[____exports.MouseButton.Left] = "Left"
____exports.MouseButton.Right = 2
____exports.MouseButton[____exports.MouseButton.Right] = "Right"
____exports.MouseButton.Middle = 4
____exports.MouseButton[____exports.MouseButton.Middle] = "Middle"
____exports.Key = Key or ({})
____exports.Key.None = 0
____exports.Key[____exports.Key.None] = "None"
____exports.Key.Shift = 1
____exports.Key[____exports.Key.Shift] = "Shift"
____exports.Key.Ctrl = 2
____exports.Key[____exports.Key.Ctrl] = "Ctrl"
____exports.Key.Alt = 4
____exports.Key[____exports.Key.Alt] = "Alt"
____exports.Key.Backspace = 8
____exports.Key[____exports.Key.Backspace] = "Backspace"
____exports.Key.Return = 16
____exports.Key[____exports.Key.Return] = "Return"
____exports.Option = Option or ({})
____exports.Option.None = 0
____exports.Option[____exports.Option.None] = "None"
____exports.Option.AlignCenter = 1
____exports.Option[____exports.Option.AlignCenter] = "AlignCenter"
____exports.Option.AlignRight = 2
____exports.Option[____exports.Option.AlignRight] = "AlignRight"
____exports.Option.NoInteract = 4
____exports.Option[____exports.Option.NoInteract] = "NoInteract"
____exports.Option.NoFrame = 8
____exports.Option[____exports.Option.NoFrame] = "NoFrame"
____exports.Option.NoResize = 16
____exports.Option[____exports.Option.NoResize] = "NoResize"
____exports.Option.NoScroll = 32
____exports.Option[____exports.Option.NoScroll] = "NoScroll"
____exports.Option.NoClose = 64
____exports.Option[____exports.Option.NoClose] = "NoClose"
____exports.Option.NoTitle = 128
____exports.Option[____exports.Option.NoTitle] = "NoTitle"
____exports.Option.HoldFocus = 256
____exports.Option[____exports.Option.HoldFocus] = "HoldFocus"
____exports.Option.AutoSize = 512
____exports.Option[____exports.Option.AutoSize] = "AutoSize"
____exports.Option.Popup = 1024
____exports.Option[____exports.Option.Popup] = "Popup"
____exports.Option.Closed = 2048
____exports.Option[____exports.Option.Closed] = "Closed"
____exports.Option.Expanded = 4096
____exports.Option[____exports.Option.Expanded] = "Expanded"
local Position = Position or ({})
Position.Unset = 0
Position[Position.Unset] = "Unset"
Position.Relative = 1
Position[Position.Relative] = "Relative"
Position.Absolute = 2
Position[Position.Absolute] = "Absolute"
____exports.ColorId = ColorId or ({})
____exports.ColorId.Text = 0
____exports.ColorId[____exports.ColorId.Text] = "Text"
____exports.ColorId.Border = 1
____exports.ColorId[____exports.ColorId.Border] = "Border"
____exports.ColorId.WindowBG = 2
____exports.ColorId[____exports.ColorId.WindowBG] = "WindowBG"
____exports.ColorId.TitleBG = 3
____exports.ColorId[____exports.ColorId.TitleBG] = "TitleBG"
____exports.ColorId.TitleText = 4
____exports.ColorId[____exports.ColorId.TitleText] = "TitleText"
____exports.ColorId.PanelBG = 5
____exports.ColorId[____exports.ColorId.PanelBG] = "PanelBG"
____exports.ColorId.Button = 6
____exports.ColorId[____exports.ColorId.Button] = "Button"
____exports.ColorId.ButtonHover = 7
____exports.ColorId[____exports.ColorId.ButtonHover] = "ButtonHover"
____exports.ColorId.ButtonFocus = 8
____exports.ColorId[____exports.ColorId.ButtonFocus] = "ButtonFocus"
____exports.ColorId.Base = 9
____exports.ColorId[____exports.ColorId.Base] = "Base"
____exports.ColorId.BaseHover = 10
____exports.ColorId[____exports.ColorId.BaseHover] = "BaseHover"
____exports.ColorId.BaseFocus = 11
____exports.ColorId[____exports.ColorId.BaseFocus] = "BaseFocus"
____exports.ColorId.ScrollBase = 12
____exports.ColorId[____exports.ColorId.ScrollBase] = "ScrollBase"
____exports.ColorId.ScrollThumb = 13
____exports.ColorId[____exports.ColorId.ScrollThumb] = "ScrollThumb"
function ____exports.rgba(self, r, g, b, a)
    return {r = r, g = g, b = b, a = a * 255}
end
____exports.Response = Response or ({})
____exports.Response.Active = 1
____exports.Response[____exports.Response.Active] = "Active"
____exports.Response.Submit = 2
____exports.Response[____exports.Response.Submit] = "Submit"
____exports.Response.Change = 4
____exports.Response[____exports.Response.Change] = "Change"
function ____exports.createDefaultStyle(self, font)
    return {
        font = font,
        size = {x = 68, y = 10},
        padding = 5,
        spacing = 4,
        indent = 24,
        titleHeight = 24,
        scrollbarSize = 12,
        thumbSize = 8,
        colors = {
            [____exports.ColorId.Text] = ____exports.rgba(
                nil,
                230,
                230,
                230,
                1
            ),
            [____exports.ColorId.Border] = ____exports.rgba(
                nil,
                25,
                25,
                25,
                1
            ),
            [____exports.ColorId.WindowBG] = ____exports.rgba(
                nil,
                50,
                50,
                50,
                1
            ),
            [____exports.ColorId.TitleBG] = ____exports.rgba(
                nil,
                25,
                25,
                25,
                1
            ),
            [____exports.ColorId.TitleText] = ____exports.rgba(
                nil,
                240,
                240,
                240,
                1
            ),
            [____exports.ColorId.PanelBG] = ____exports.rgba(
                nil,
                0,
                0,
                0,
                0
            ),
            [____exports.ColorId.Button] = ____exports.rgba(
                nil,
                75,
                75,
                75,
                1
            ),
            [____exports.ColorId.ButtonHover] = ____exports.rgba(
                nil,
                95,
                95,
                95,
                1
            ),
            [____exports.ColorId.ButtonFocus] = ____exports.rgba(
                nil,
                115,
                115,
                115,
                1
            ),
            [____exports.ColorId.Base] = ____exports.rgba(
                nil,
                30,
                30,
                30,
                1
            ),
            [____exports.ColorId.BaseHover] = ____exports.rgba(
                nil,
                35,
                35,
                35,
                1
            ),
            [____exports.ColorId.BaseFocus] = ____exports.rgba(
                nil,
                40,
                40,
                40,
                1
            ),
            [____exports.ColorId.ScrollBase] = ____exports.rgba(
                nil,
                43,
                43,
                43,
                1
            ),
            [____exports.ColorId.ScrollThumb] = ____exports.rgba(
                nil,
                30,
                30,
                30,
                1
            )
        }
    }
end
function ____exports.vec2(self, x, y)
    return {x = x, y = y}
end
function ____exports.rect(self, x, y, w, h)
    return {x = x, y = y, w = w, h = h}
end
local function clamp(self, x, min, max)
    return math.min(
        math.max(x, min),
        max
    )
end
local function rectOverlapsVec2(self, r, p)
    return p.x >= r.x and p.x < r.x + r.w and p.y >= r.y and p.y < r.y + r.h
end
local function intersectRects(self, r1, r2)
    local x1 = math.max(r1.x, r2.x)
    local y1 = math.max(r1.y, r2.y)
    local x2 = math.min(r1.x + r1.w, r2.x + r2.w)
    local y2 = math.min(r1.y + r1.h, r2.y + r2.h)
    if x2 < x1 then
        x2 = x1
    end
    if y2 < y1 then
        y2 = y1
    end
    return {x = x1, y = y1, w = x2 - x1, h = y2 - y1}
end
function ____exports.expandRect(self, rect, n)
    return {x = rect.x - n, y = rect.y - n, w = rect.w + n * 2, h = rect.h + n * 2}
end
local UNCLIPPED_RECT = {x = 0, y = 0, w = 16777216, h = 16777216}
____exports.Clip = Clip or ({})
____exports.Clip.None = 0
____exports.Clip[____exports.Clip.None] = "None"
____exports.Clip.Part = 1
____exports.Clip[____exports.Clip.Part] = "Part"
____exports.Clip.All = 2
____exports.Clip[____exports.Clip.All] = "All"
____exports.IconId = IconId or ({})
____exports.IconId.Close = 0
____exports.IconId[____exports.IconId.Close] = "Close"
____exports.IconId.Check = 1
____exports.IconId[____exports.IconId.Check] = "Check"
____exports.IconId.Collapsed = 2
____exports.IconId[____exports.IconId.Collapsed] = "Collapsed"
____exports.IconId.Expanded = 3
____exports.IconId[____exports.IconId.Expanded] = "Expanded"
____exports.CommandType = CommandType or ({})
____exports.CommandType.Jump = 0
____exports.CommandType[____exports.CommandType.Jump] = "Jump"
____exports.CommandType.Clip = 1
____exports.CommandType[____exports.CommandType.Clip] = "Clip"
____exports.CommandType.Rect = 2
____exports.CommandType[____exports.CommandType.Rect] = "Rect"
____exports.CommandType.Text = 3
____exports.CommandType[____exports.CommandType.Text] = "Text"
____exports.CommandType.Icon = 4
____exports.CommandType[____exports.CommandType.Icon] = "Icon"
____exports.CommandType.Custom = 5
____exports.CommandType[____exports.CommandType.Custom] = "Custom"
local MU_REAL_FMT = "%.3g"
local MU_MAX_FMT = 127
local MU_SLIDER_FMT = "%.2f"
____exports.Context = __TS__Class()
local Context = ____exports.Context
Context.name = "Context"
function Context.prototype.____constructor(self, textWidth, textHeight, style)
    self.textWidth = textWidth
    self.textHeight = textHeight
    self.style = style
    self.hover = nil
    self.focus = nil
    self.lastId = nil
    self.lastRect = nil
    self.lastZindex = 0
    self.updatedFocus = false
    self.hoverRoot = nil
    self.nextHoverRoot = nil
    self.scrollTarget = nil
    self.numberEditBuf = ""
    self.numberEdit = nil
    self.treeNodes = {}
    self.commands = {}
    self.roots = {}
    self.containerStack = {}
    self.clipStack = {}
    self.idStack = {}
    self.layoutStack = {}
    self.containers = {}
    self.mousePos = {x = 0, y = 0}
    self.lastMousePos = {x = 0, y = 0}
    self.mouseDelta = {x = 0, y = 0}
    self.scrollDelta = {x = 0, y = 0}
    self.mouseDown = ____exports.MouseButton.None
    self.mousePressed = ____exports.MouseButton.None
    self.keyDown = ____exports.Key.None
    self.keyPressed = ____exports.Key.None
    self._inputText = ""
end
function Context.prototype.inputMouseMove(self, x, y)
    self.mousePos.x = x
    self.mousePos.y = y
end
function Context.prototype.inputScroll(self, x, y)
    local ____self_scrollDelta_0, ____x_1 = self.scrollDelta, "x"
    ____self_scrollDelta_0[____x_1] = ____self_scrollDelta_0[____x_1] + x
    local ____self_scrollDelta_2, ____y_3 = self.scrollDelta, "y"
    ____self_scrollDelta_2[____y_3] = ____self_scrollDelta_2[____y_3] + y
end
function Context.prototype.inputText(self, text)
    self._inputText = text
end
function Context.prototype.inputMouseDown(self, btn)
    self.mouseDown = self.mouseDown | btn
    self.mousePressed = self.mousePressed | btn
end
function Context.prototype.inputMouseUp(self, btn)
    self.mouseDown = self.mouseDown & ~btn
end
function Context.prototype.inputMouseContinuous(self, btn)
    self.mousePressed = self.mousePressed | btn & ~self.mouseDown
    self.mouseDown = btn
end
function Context.prototype.inputKeyDown(self, key)
    self.keyDown = self.keyDown | key
    self.keyPressed = self.keyPressed | key
end
function Context.prototype.inputKeyUp(self, key)
    self.keyDown = self.keyDown & ~key
end
function Context.prototype.inputKeyContinuous(self, key)
    self.keyPressed = self.keyPressed | key & ~self.keyDown
    self.keyDown = key
end
function Context.prototype.begin(self)
    self.commands = {}
    self.roots = {}
    self.scrollTarget = nil
    self.hoverRoot = self.nextHoverRoot
    self.nextHoverRoot = nil
    self.mouseDelta.x = self.mousePos.x - self.lastMousePos.x
    self.mouseDelta.y = self.mousePos.y - self.lastMousePos.y
end
function Context.prototype.getId(self, name)
    local initialId = #self.idStack == 0 and HASH_INITIAL or self.idStack[#self.idStack]
    local newId = hashString(nil, initialId, name)
    self.lastId = newId
    return newId
end
function Context.prototype.pushId(self, name)
    local ____self_idStack_4 = self.idStack
    ____self_idStack_4[#____self_idStack_4 + 1] = self:getId(name)
end
function Context.prototype.popId(self)
    table.remove(self.idStack)
end
function Context.prototype.bringToFront(self, cnt)
    local ____cnt_8 = cnt
    local ____self_5, ____lastZindex_6 = self, "lastZindex"
    local ____self_lastZindex_7 = ____self_5[____lastZindex_6] + 1
    ____self_5[____lastZindex_6] = ____self_lastZindex_7
    ____cnt_8.zindex = ____self_lastZindex_7
end
function Context.prototype.getContainer(self, id, opt)
    if opt == nil then
        opt = ____exports.Option.None
    end
    if self.containers[id] ~= nil then
        return self.containers[id]
    end
    if opt & ____exports.Option.Closed ~= 0 then
        return nil
    end
    local container = {
        headIdx = nil,
        tailIdx = nil,
        rect = {x = 0, y = 0, w = 0, h = 0},
        body = {x = 0, y = 0, w = 0, h = 0},
        contentSize = {x = 0, y = 0},
        scroll = {x = 0, y = 0},
        zindex = 0,
        open = true,
        root = false
    }
    self:bringToFront(container)
    self.containers[id] = container
    return container
end
function Context.prototype.getCurrentContainer(self)
    assert(#self.containerStack > 0, "attempted to get current container when there are no containers")
    return self.containerStack[#self.containerStack]
end
function Context.prototype.inHoverRoot(self)
    do
        local i = #self.containerStack - 1
        while i >= 0 do
            local cnt = self.containerStack[i + 1]
            if cnt == self.hoverRoot then
                return true
            end
            if cnt.root then
                break
            end
            i = i - 1
        end
    end
    return false
end
function Context.prototype.getClipRect(self)
    assert(#self.clipStack > 0)
    return self.clipStack[#self.clipStack]
end
function Context.prototype.mouseOver(self, rect)
    return rectOverlapsVec2(nil, rect, self.mousePos) and rectOverlapsVec2(
        nil,
        self:getClipRect(),
        self.mousePos
    ) and self:inHoverRoot()
end
function Context.prototype.setFocus(self, id)
    self.focus = id
    self.updatedFocus = true
end
function Context.prototype.updateControl(self, id, rect, opt)
    if self.focus == id then
        self.updatedFocus = true
    end
    if opt & ____exports.Option.NoInteract ~= 0 then
        return
    end
    local mouseover = self:mouseOver(rect)
    if mouseover and self.mouseDown == 0 then
        self.hover = id
    end
    if self.focus == id then
        if self.mousePressed ~= 0 and not mouseover then
            self:setFocus(nil)
        end
        if self.mouseDown == 0 and opt & ____exports.Option.HoldFocus == 0 then
            self:setFocus(nil)
        end
    end
    if self.hover == id then
        if self.mousePressed ~= 0 then
            self:setFocus(id)
        elseif not mouseover then
            self.hover = nil
        end
    end
end
function Context.prototype.pushJump(self, dstIdx, oob)
    if oob == nil then
        oob = false
    end
    if not oob then
        assert(dstIdx ~= nil and 0 <= dstIdx and dstIdx < #self.commands, "attempted to push jump command to out-of-bounds")
    end
    local cmd = {type = ____exports.CommandType.Jump, dstIdx = dstIdx}
    local ____self_commands_9 = self.commands
    ____self_commands_9[#____self_commands_9 + 1] = cmd
    return #self.commands - 1
end
function Context.prototype.beginRootContainer(self, cnt)
    local ____self_containerStack_10 = self.containerStack
    ____self_containerStack_10[#____self_containerStack_10 + 1] = cnt
    local ____self_roots_11 = self.roots
    ____self_roots_11[#____self_roots_11 + 1] = cnt
    cnt.headIdx = self:pushJump(nil, true)
    if rectOverlapsVec2(nil, cnt.rect, self.mousePos) and (not self.nextHoverRoot or cnt.zindex > self.nextHoverRoot.zindex) then
        self.nextHoverRoot = cnt
    end
    local ____self_clipStack_12 = self.clipStack
    ____self_clipStack_12[#____self_clipStack_12 + 1] = UNCLIPPED_RECT
end
function Context.prototype.drawRect(self, rect, color)
    rect = intersectRects(
        nil,
        rect,
        self:getClipRect()
    )
    if rect.w > 0 and rect.h > 0 then
        local cmd = {type = ____exports.CommandType.Rect, rect = rect, color = color}
        local ____self_commands_13 = self.commands
        ____self_commands_13[#____self_commands_13 + 1] = cmd
    end
end
function Context.prototype.drawBox(self, r, color)
    self:drawRect({x = r.x + 1, y = r.y, w = r.w - 2, h = 1}, color)
    self:drawRect({x = r.x + 1, y = r.y + r.h - 1, w = r.w - 2, h = 1}, color)
    self:drawRect({x = r.x, y = r.y, w = 1, h = r.h}, color)
    self:drawRect({x = r.x + r.w - 1, y = r.y, w = 1, h = r.h}, color)
end
function Context.prototype.drawFrame(self, rect, colorId)
    local color = self.style.colors[colorId]
    self:drawRect(rect, color)
    if colorId == ____exports.ColorId.ScrollBase or colorId == ____exports.ColorId.ScrollThumb or colorId == ____exports.ColorId.TitleBG then
        return
    end
    if self.style.colors[____exports.ColorId.Border].a > 0 then
        self:drawBox(
            ____exports.expandRect(nil, rect, 1),
            self.style.colors[____exports.ColorId.Border]
        )
    end
end
function Context.prototype.pushClipRect(self, rect)
    local last = self:getClipRect()
    local ____self_clipStack_14 = self.clipStack
    ____self_clipStack_14[#____self_clipStack_14 + 1] = intersectRects(nil, rect, last)
end
function Context.prototype.popClipRect(self)
    table.remove(self.clipStack)
end
function Context.prototype.checkClip(self, r)
    local cr = self:getClipRect()
    if r.x > cr.x + cr.w or r.x + r.w < cr.x or r.y > cr.y + cr.h or r.y + r.h < cr.y then
        return ____exports.Clip.All
    end
    if r.x >= cr.x and r.x + r.w <= cr.x + cr.w and r.y >= cr.y and r.y + r.h <= cr.y + cr.h then
        return ____exports.Clip.None
    end
    return ____exports.Clip.Part
end
function Context.prototype.setClip(self, rect)
    local cmd = {type = ____exports.CommandType.Clip, rect = rect}
    local ____self_commands_15 = self.commands
    ____self_commands_15[#____self_commands_15 + 1] = cmd
end
function Context.prototype.drawText(self, font, str, len, pos, color)
    local ____pos_x_20 = pos.x
    local ____pos_y_21 = pos.y
    local ____self_textWidth_19 = self.textWidth
    local ____font_17 = font
    local ____str_18 = str
    local ____temp_16
    if len == nil then
        ____temp_16 = nil
    else
        ____temp_16 = len
    end
    local rect = {
        x = ____pos_x_20,
        y = ____pos_y_21,
        w = ____self_textWidth_19(self, ____font_17, ____str_18, ____temp_16),
        h = self:textHeight(font)
    }
    local clipped = self:checkClip(rect)
    if clipped == ____exports.Clip.All then
        return
    end
    if clipped == ____exports.Clip.Part then
        self:setClip(self:getClipRect())
    end
    if len == nil then
        len = #str
    end
    local cmd = {
        type = ____exports.CommandType.Text,
        color = color,
        font = font,
        pos = pos,
        str = str
    }
    local ____self_commands_22 = self.commands
    ____self_commands_22[#____self_commands_22 + 1] = cmd
    if clipped ~= ____exports.Clip.None then
        self:setClip(UNCLIPPED_RECT)
    end
end
function Context.prototype.drawControlFrame(self, id, rect, colorid, opt)
    if opt & ____exports.Option.NoFrame ~= 0 then
        return
    end
    colorid = colorid + (self.focus == id and 2 or (self.hover == id and 1 or 0))
    self:drawFrame(rect, colorid)
end
function Context.prototype.drawControlText(self, str, rect, colorid, opt)
    local pos = {x = 0, y = 0}
    local font = self.style.font
    local tw = self:textWidth(font, str)
    self:pushClipRect(rect)
    pos.y = rect.y + (rect.h - self:textHeight(font)) / 2
    if opt & ____exports.Option.AlignCenter ~= 0 then
        pos.x = rect.x + (rect.w - tw) / 2
    elseif opt & ____exports.Option.AlignRight ~= 0 then
        pos.x = rect.x + rect.w - tw - self.style.padding
    else
        pos.x = rect.x + self.style.padding
    end
    self:drawText(
        font,
        str,
        -1,
        pos,
        self.style.colors[colorid]
    )
    self:popClipRect()
end
function Context.prototype.drawIcon(self, id, rect, color)
    local clipped = self:checkClip(rect)
    if clipped == ____exports.Clip.All then
        return
    end
    if clipped == ____exports.Clip.Part then
        self:setClip(self:getClipRect())
    end
    local cmd = {type = ____exports.CommandType.Icon, color = color, rect = rect, id = id}
    local ____self_commands_23 = self.commands
    ____self_commands_23[#____self_commands_23 + 1] = cmd
    if clipped ~= ____exports.Clip.None then
        self:setClip(UNCLIPPED_RECT)
    end
end
function Context.prototype.scrollbar(self, cnt, viewBounds, contentSize, otherDir, scrollDir, otherLength, scrollLength)
    local maxscroll = contentSize[scrollDir] - viewBounds[scrollLength]
    if maxscroll > 0 and viewBounds[scrollLength] > 0 then
        local id = self:getId("!scrollbar" .. scrollDir)
        local base = deepcopy(viewBounds)
        base[otherDir] = viewBounds[otherDir] + viewBounds[otherLength]
        base[otherLength] = self.style.scrollbarSize
        self:updateControl(id, base, 0)
        if self.focus == id and self.mouseDown == ____exports.MouseButton.Left then
            local ____cnt_scroll_24, ____scrollDir_25 = cnt.scroll, scrollDir
            ____cnt_scroll_24[____scrollDir_25] = ____cnt_scroll_24[____scrollDir_25] + self.mouseDelta[scrollDir] * contentSize[scrollDir] / base[scrollLength]
        end
        cnt.scroll[scrollDir] = clamp(nil, cnt.scroll[scrollDir], 0, maxscroll)
        self:drawFrame(base, ____exports.ColorId.ScrollBase)
        local thumb = deepcopy(base)
        thumb[scrollLength] = math.max(self.style.thumbSize, base[scrollLength] * viewBounds[scrollLength] / contentSize[scrollDir])
        thumb[scrollDir] = thumb[scrollDir] + cnt.scroll[scrollDir] * (base[scrollLength] - thumb[scrollLength]) / maxscroll
        self:drawFrame(thumb, ____exports.ColorId.ScrollThumb)
        if self:mouseOver(viewBounds) then
            self.scrollTarget = cnt
        end
    else
        cnt.scroll[scrollDir] = 0
    end
end
function Context.prototype.scrollbars(self, cnt, body)
    local sz = self.style.scrollbarSize
    local cs = deepcopy(cnt.contentSize)
    cs.x = cs.x + self.style.padding * 2
    cs.y = cs.y + self.style.padding * 2
    self:pushClipRect(body)
    if cs.y > cnt.body.h then
        body.w = body.w - sz
    end
    if cs.x > cnt.body.w then
        body.h = body.h - sz
    end
    self:scrollbar(
        cnt,
        body,
        cs,
        "x",
        "y",
        "w",
        "h"
    )
    self:scrollbar(
        cnt,
        body,
        cs,
        "y",
        "x",
        "h",
        "w"
    )
    self:popClipRect()
end
function Context.prototype.getLayout(self)
    local count = #self.layoutStack
    assert(count > 0, "layout stack is empty")
    return self.layoutStack[count]
end
function Context.prototype.layoutRow(self, widths, height)
    local layout = self:getLayout()
    if widths ~= nil then
        assert(#widths > 0, "list of widths must contain at least 1 number")
        layout.widths = {table.unpack(widths)}
    else
    end
    layout.position = {x = layout.indent, y = layout.nextRow}
    layout.size.y = height
    layout.itemIndex = 0
end
function Context.prototype.pushLayout(self, body, scroll)
    local layout = {
        body = {x = body.x - scroll.x, y = body.y - scroll.y, w = body.w, h = body.h},
        next = {x = 0, y = 0, w = 0, h = 0},
        position = {x = 0, y = 0},
        size = {x = 0, y = 0},
        max = {x = -16777216, y = -16777216},
        widths = {},
        itemIndex = 0,
        nextRow = 0,
        nextType = Position.Unset,
        indent = 0
    }
    local ____self_layoutStack_26 = self.layoutStack
    ____self_layoutStack_26[#____self_layoutStack_26 + 1] = layout
    self:layoutRow({0}, 0)
end
function Context.prototype.layoutSetNext(self, r, relative)
    local layout = self:getLayout()
    layout.next = r
    layout.nextType = relative and Position.Relative or Position.Absolute
end
function Context.prototype.layoutNext(self)
    local layout = self:getLayout()
    local res = {x = 0, y = 0, w = 0, h = 0}
    if layout.nextType ~= Position.Unset then
        local ____type = layout.nextType
        layout.nextType = Position.Unset
        res = layout.next
        if ____type == Position.Absolute then
            self.lastRect = __TS__ObjectAssign({}, res)
            return res
        end
    else
        if layout.itemIndex == #layout.widths then
            self:layoutRow(nil, layout.size.y)
        end
        res.x = layout.position.x
        res.y = layout.position.y
        res.w = #layout.widths > 0 and layout.widths[layout.itemIndex + 1] or layout.size.x
        res.h = layout.size.y
        if res.w == 0 then
            res.w = self.style.size.x + self.style.padding * 2
        end
        if res.h == 0 then
            res.h = self.style.size.y + self.style.padding * 2
        end
        if res.w < 0 then
            res.w = res.w + (layout.body.w - res.x + 1)
        end
        if res.h < 0 then
            res.h = res.h + (layout.body.h - res.y + 1)
        end
        layout.itemIndex = layout.itemIndex + 1
    end
    local ____layout_position_27, ____x_28 = layout.position, "x"
    ____layout_position_27[____x_28] = ____layout_position_27[____x_28] + (res.w + self.style.spacing)
    layout.nextRow = math.max(layout.nextRow, res.y + res.h + self.style.spacing)
    res.x = res.x + layout.body.x
    res.y = res.y + layout.body.y
    layout.max.x = math.max(layout.max.x, res.x + res.w)
    layout.max.y = math.max(layout.max.y, res.y + res.h)
    self.lastRect = __TS__ObjectAssign({}, res)
    return res
end
function Context.prototype.pushContainerBody(self, cnt, body, opt)
    if opt & ____exports.Option.NoScroll == 0 then
        self:scrollbars(cnt, body)
    end
    self:pushLayout(
        ____exports.expandRect(nil, body, -self.style.padding),
        cnt.scroll
    )
    cnt.body = body
end
function Context.prototype.beginWindow(self, title, rect, opt)
    if opt == nil then
        opt = ____exports.Option.None
    end
    local id = self:getId(title)
    local cnt = self:getContainer(id, opt)
    if not cnt or not cnt.open then
        return false
    end
    local ____self_idStack_29 = self.idStack
    ____self_idStack_29[#____self_idStack_29 + 1] = id
    if cnt.rect.w == 0 then
        cnt.rect = rect
    else
        rect = cnt.rect
    end
    local body = deepcopy(rect)
    self:beginRootContainer(cnt)
    if opt & ____exports.Option.NoFrame == 0 then
        self:drawFrame(rect, ____exports.ColorId.WindowBG)
    end
    if opt & ____exports.Option.NoTitle == 0 then
        local tr = __TS__ObjectAssign({}, rect, {h = self.style.titleHeight})
        self:drawFrame(tr, ____exports.ColorId.TitleBG)
        local id = self:getId("!title")
        self:updateControl(id, tr, opt)
        self:drawControlText(title, tr, ____exports.ColorId.TitleText, opt)
        if self.focus == id and self.mouseDown == ____exports.MouseButton.Left then
            local ____cnt_rect_30, ____x_31 = cnt.rect, "x"
            ____cnt_rect_30[____x_31] = ____cnt_rect_30[____x_31] + self.mouseDelta.x
            local ____cnt_rect_32, ____y_33 = cnt.rect, "y"
            ____cnt_rect_32[____y_33] = ____cnt_rect_32[____y_33] + self.mouseDelta.y
        end
        body.y = body.y + tr.h
        body.h = body.h - tr.h
        if opt & ____exports.Option.NoClose == 0 then
            local id = self:getId("!close")
            local r = {x = tr.x + tr.w - tr.h, y = tr.y, w = tr.h, h = tr.h}
            tr.w = tr.w - r.w
            self:drawIcon(____exports.IconId.Close, r, self.style.colors[____exports.ColorId.TitleText])
            self:updateControl(id, r, opt)
            if self.focus == id and self.mouseDown == ____exports.MouseButton.Left then
                cnt.open = false
            end
        end
    end
    self:pushContainerBody(cnt, body, opt)
    if opt & ____exports.Option.NoResize == 0 then
        local sz = self.style.titleHeight
        local id = self:getId("!resize")
        local r = {x = rect.x + rect.w - sz, y = rect.y + rect.h - sz, w = sz, h = sz}
        self:updateControl(id, r, opt)
        if self.focus == id and self.mouseDown == ____exports.MouseButton.Left then
            cnt.rect.w = math.max(96, cnt.rect.w + self.mouseDelta.x)
            cnt.rect.h = math.max(64, cnt.rect.h + self.mouseDelta.y)
        end
    end
    if opt & ____exports.Option.AutoSize ~= 0 then
        local r = self:getLayout().body
        cnt.rect.w = cnt.contentSize.x + (cnt.rect.w - r.w)
        cnt.rect.h = cnt.contentSize.y + (cnt.rect.h - r.h)
    end
    if opt & ____exports.Option.Popup ~= 0 and self.mousePressed ~= 0 and self.hoverRoot ~= cnt then
        cnt.open = false
    end
    self:pushClipRect(cnt.body)
    return ____exports.Response.Active
end
function Context.prototype.popContainer(self)
    local cnt = self:getCurrentContainer()
    local layout = self:getLayout()
    cnt.contentSize.x = layout.max.x - layout.body.x
    cnt.contentSize.y = layout.max.y - layout.body.y
    table.remove(self.containerStack)
    table.remove(self.layoutStack)
    table.remove(self.idStack)
end
function Context.prototype.endRootContainer(self)
    local cnt = self:getCurrentContainer()
    cnt.tailIdx = self:pushJump(nil, true)
    if cnt.headIdx == nil then
        error("container headIdx is null when ending root container")
    end
    local head = self.commands[cnt.headIdx + 1]
    if head.type ~= ____exports.CommandType.Jump then
        error("container headIdx doesn't point to Jump command")
    end
    head.dstIdx = #self.commands
    self:popClipRect()
    self:popContainer()
end
function Context.prototype.endWindow(self)
    self:popClipRect()
    self:endRootContainer()
end
Context.prototype["end"] = function(self)
    assert(#self.containerStack == 0)
    assert(#self.clipStack == 0)
    assert(#self.idStack == 0)
    assert(#self.layoutStack == 0)
    if self.scrollTarget ~= nil then
        local ____self_scrollTarget_scroll_34, ____x_35 = self.scrollTarget.scroll, "x"
        ____self_scrollTarget_scroll_34[____x_35] = ____self_scrollTarget_scroll_34[____x_35] + self.scrollDelta.x
        local ____self_scrollTarget_scroll_36, ____y_37 = self.scrollTarget.scroll, "y"
        ____self_scrollTarget_scroll_36[____y_37] = ____self_scrollTarget_scroll_36[____y_37] + self.scrollDelta.y
    end
    if not self.updatedFocus then
        self.focus = nil
    end
    self.updatedFocus = false
    if self.mousePressed ~= 0 and self.nextHoverRoot ~= nil and self.nextHoverRoot.zindex < self.lastZindex and self.nextHoverRoot.zindex >= 0 then
        self:bringToFront(self.nextHoverRoot)
    end
    self.keyPressed = ____exports.Key.None
    self._inputText = ""
    self.mousePressed = ____exports.MouseButton.None
    self.scrollDelta = {x = 0, y = 0}
    self.lastMousePos.x = self.mousePos.x
    self.lastMousePos.y = self.mousePos.y
    __TS__ArraySort(
        self.roots,
        function(____, a, b) return a.zindex - b.zindex end
    )
    do
        local i = 0
        while i < #self.roots do
            local cnt = self.roots[i + 1]
            if i == 0 then
                local cmd = self.commands[1]
                if cmd.type ~= ____exports.CommandType.Jump then
                    error("first command in list should be jump")
                end
                if cnt.headIdx == nil then
                    error("headIdx of container is not set")
                end
                cmd.dstIdx = cnt.headIdx + 1
            else
                local prev = self.roots[i]
                if prev.tailIdx == nil then
                    error("tailIdx of container is not set")
                end
                local cmd = self.commands[prev.tailIdx + 1]
                if cmd.type ~= ____exports.CommandType.Jump then
                    error("first command in list should be jump")
                end
                if cnt.headIdx == nil then
                    error("headIdx of container is not set")
                end
                cmd.dstIdx = cnt.headIdx + 1
            end
            if i == #self.roots - 1 then
                if cnt.tailIdx == nil then
                    error("tailIdx of container is not set")
                end
                local cmd = self.commands[cnt.tailIdx + 1]
                if cmd.type ~= ____exports.CommandType.Jump then
                    error("first command in list should be jump")
                end
                cmd.dstIdx = #self.commands
            end
            i = i + 1
        end
    end
end
Context.prototype.iterCommands = __TS__Generator(function(self)
    local i = 0
    while true do
        do
            if i >= #self.commands then
                break
            end
            local cmd = self.commands[i + 1]
            if cmd.type == ____exports.CommandType.Jump then
                assert(cmd.dstIdx ~= nil, "attempt to perform Jump command with null destination")
                i = cmd.dstIdx
                goto __continue139
            end
            coroutine.yield(cmd)
            i = i + 1
        end
        ::__continue139::
    end
end)
function Context.prototype.header(self, label, opt)
    if opt == nil then
        opt = ____exports.Option.None
    end
    return self:_header(label, opt, false)
end
function Context.prototype._header(self, label, opt, istreenode)
    if opt == nil then
        opt = ____exports.Option.None
    end
    if istreenode == nil then
        istreenode = false
    end
    local id = self:getId(label)
    self:layoutRow({-1}, 0)
    local active = self.treeNodes[id] == true
    local ____temp_38
    if opt & ____exports.Option.Expanded ~= 0 then
        ____temp_38 = not active
    else
        ____temp_38 = active
    end
    local expanded = ____temp_38
    local r = self:layoutNext()
    self:updateControl(id, r, ____exports.Option.None)
    if self.mousePressed == ____exports.MouseButton.Left and self.focus == id then
        active = not active
    end
    if active then
        self.treeNodes[id] = true
    else
        __TS__Delete(self.treeNodes, id)
    end
    if istreenode then
        if self.hover == id then
            self:drawFrame(r, ____exports.ColorId.ButtonHover)
        end
    else
        self:drawControlFrame(id, r, ____exports.ColorId.Button, 0)
    end
    self:drawIcon(
        expanded and ____exports.IconId.Expanded or ____exports.IconId.Collapsed,
        ____exports.rect(
            nil,
            r.x,
            r.y,
            r.h,
            r.h
        ),
        self.style.colors[____exports.ColorId.Text]
    )
    r.x = r.x + (r.h - self.style.padding)
    r.w = r.w - (r.h - self.style.padding)
    self:drawControlText(label, r, ____exports.ColorId.Text, 0)
    return expanded and ____exports.Response.Active or false
end
function Context.prototype.label(self, text)
    self:drawControlText(
        text,
        self:layoutNext(),
        ____exports.ColorId.Text,
        0
    )
end
function Context.prototype.button(self, label, opt)
    if opt == nil then
        opt = ____exports.Option.None
    end
    local res = 0
    local id = type(label) == "string" and self:getId(label) or self:getId("icon" .. tostring(label))
    local r = self:layoutNext()
    self:updateControl(id, r, opt)
    if self.mousePressed == ____exports.MouseButton.Left and self.focus == id then
        res = res | ____exports.Response.Submit
    end
    self:drawControlFrame(id, r, ____exports.ColorId.Button, opt)
    if type(label) == "string" then
        self:drawControlText(label, r, ____exports.ColorId.Text, opt)
    else
        self:drawIcon(label, r, self.style.colors[____exports.ColorId.Text])
    end
    local ____temp_39
    if res == 0 then
        ____temp_39 = false
    else
        ____temp_39 = res
    end
    return ____temp_39
end
function Context.prototype.openPopup(self, name)
    local id = self:getId(name)
    local cnt = self:getContainer(id)
    if cnt == nil then
        error("openPopup: container is null")
    end
    self.nextHoverRoot = cnt
    self.hoverRoot = cnt
    cnt.rect = ____exports.rect(
        nil,
        self.mousePos.x,
        self.mousePos.y,
        1,
        1
    )
    cnt.open = true
    self:bringToFront(cnt)
end
function Context.prototype.beginPopup(self, name, rect, opt)
    if rect == nil then
        rect = {x = 0, y = 0, w = 0, h = 0}
    end
    if opt == nil then
        opt = ____exports.Option.Popup | ____exports.Option.AutoSize | ____exports.Option.NoResize | ____exports.Option.NoScroll | ____exports.Option.NoTitle | ____exports.Option.Closed
    end
    return self:beginWindow(name, rect, opt)
end
function Context.prototype.endPopup(self)
    self:endWindow()
end
function Context.prototype.layoutBeginColumn(self)
    self:pushLayout(
        self:layoutNext(),
        {x = 0, y = 0}
    )
end
function Context.prototype.layoutEndColumn(self)
    local b = self:getLayout()
    table.remove(self.layoutStack)
    local a = self:getLayout()
    a.position.x = math.max(a.position.x, b.position.x + b.body.x - a.body.x)
    a.nextRow = math.max(a.nextRow, b.nextRow + b.body.y - a.body.y)
    a.max.x = math.max(a.max.x, b.max.x)
    a.max.y = math.max(a.max.y, b.max.y)
end
function Context.prototype.textboxRaw(self, buf, maxBufSize, id, r, opt)
    local res = false
    self:updateControl(id, r, opt | ____exports.Option.HoldFocus)
    if self.focus == id then
        if maxBufSize == nil then
            local newCharCount = #self._inputText
            if newCharCount > 0 then
                buf = buf .. self._inputText
                res = ____exports.Response.Change
            end
        else
            local freeSpace = maxBufSize - #buf
            local newCharCount = #self._inputText
            if freeSpace > 0 and newCharCount > 0 then
                buf = buf .. __TS__StringSlice(self._inputText, 0, freeSpace)
                res = ____exports.Response.Change
            end
        end
        if self.keyPressed & ____exports.Key.Backspace ~= 0 and #buf > 0 then
            buf = __TS__StringSlice(buf, 0, #buf - 1)
            res = ____exports.Response.Change
        end
        if self.keyPressed & ____exports.Key.Return ~= 0 then
            self:setFocus(nil)
            res = ____exports.Response.Submit
        end
    end
    self:drawControlFrame(id, r, ____exports.ColorId.Base, opt)
    if self.focus == id then
        local color = self.style.colors[____exports.ColorId.Text]
        local font = self.style.font
        local textw = self:textWidth(font, buf)
        local texth = self:textHeight(font)
        local ofx = r.w - self.style.padding - textw - 1
        local textx = r.x + math.min(ofx, self.style.padding)
        local texty = r.y + (r.h - texth) / 2
        self:pushClipRect(r)
        self:drawText(
            font,
            buf,
            nil,
            {x = textx, y = texty},
            color
        )
        self:drawRect(
            ____exports.rect(
                nil,
                textx + textw,
                texty,
                1,
                texth
            ),
            color
        )
        self:popClipRect()
    else
        self:drawControlText(buf, r, ____exports.ColorId.Text, opt)
    end
    return {res, buf}
end
function Context.prototype.numberTextbox(self, value, r, id)
    if self.mousePressed == ____exports.MouseButton.Left and self.keyDown & ____exports.Key.Shift ~= 0 and self.hover == id then
        self.numberEdit = id
        self.numberEditBuf = string.format(MU_REAL_FMT, value)
    end
    if self.numberEdit == id then
        local res, newVal = table.unpack(self:textboxRaw(
            self.numberEditBuf,
            MU_MAX_FMT,
            id,
            r,
            0
        ))
        if res then
            self.numberEditBuf = newVal
        end
        if res and res & ____exports.Response.Submit ~= 0 or self.focus ~= id then
            value = __TS__ParseFloat(self.numberEditBuf)
            self.numberEdit = nil
            return {res, value}
        else
            return {____exports.Response.Active, value}
        end
    end
    return {false, value}
end
function Context.prototype.slider(self, identifier, value, low, high, step, fmt, opt)
    if fmt == nil then
        fmt = MU_SLIDER_FMT
    end
    if opt == nil then
        opt = ____exports.Option.AlignCenter
    end
    local res = false
    local last = value
    local id = self:getId(identifier)
    local base = self:layoutNext()
    local textboxRes, newVal = table.unpack(self:numberTextbox(value, base, id))
    if textboxRes then
        return newVal
    end
    self:updateControl(id, base, opt)
    if self.focus == id and self.mouseDown | self.mousePressed == ____exports.MouseButton.Left then
        value = low + (self.mousePos.x - base.x) * (high - low) / base.w
        if step ~= nil and step ~= 0 then
            value = math.floor((value - low) / step + 0.5) * step + low
            value = math.max(
                low,
                math.min(value, high)
            )
        end
    end
    value = clamp(nil, value, low, high)
    if last ~= value then
        res = ____exports.Response.Change
    end
    self:drawControlFrame(id, base, ____exports.ColorId.Base, opt)
    local w = self.style.thumbSize
    local x = (value - low) * (base.w - w) / (high - low)
    local thumb = ____exports.rect(
        nil,
        base.x + x,
        base.y,
        w,
        base.h
    )
    self:drawControlFrame(id, thumb, ____exports.ColorId.Button, opt)
    local buf = string.format(fmt, value)
    self:drawControlText(buf, base, ____exports.ColorId.Text, opt)
    return value
end
function Context.prototype.beginTreenode(self, label, opt)
    if opt == nil then
        opt = ____exports.Option.None
    end
    local res = self:_header(label, opt, true)
    if res and res & ____exports.Response.Active ~= 0 then
        local ____temp_40, ____indent_41 = self:getLayout(), "indent"
        ____temp_40[____indent_41] = ____temp_40[____indent_41] + self.style.indent
        assert(self.lastId ~= nil)
        local ____self_idStack_42 = self.idStack
        ____self_idStack_42[#____self_idStack_42 + 1] = self.lastId
    end
    return res
end
function Context.prototype.endTreenode(self)
    local ____temp_43, ____indent_44 = self:getLayout(), "indent"
    ____temp_43[____indent_44] = ____temp_43[____indent_44] - self.style.indent
    table.remove(self.idStack)
end
function Context.prototype.checkbox(self, label, state)
    local res = false
    local id = self:getId(label)
    local r = self:layoutNext()
    local box = ____exports.rect(
        nil,
        r.x,
        r.y,
        r.h,
        r.h
    )
    self:updateControl(id, r, 0)
    if self.mousePressed == ____exports.MouseButton.Left and self.focus == id then
        res = ____exports.Response.Change
        state = not state
    end
    self:drawControlFrame(id, box, ____exports.ColorId.Base, 0)
    if state then
        self:drawIcon(____exports.IconId.Check, box, self.style.colors[____exports.ColorId.Text])
    end
    local r2 = ____exports.rect(
        nil,
        r.x + box.w,
        r.y,
        r.w - box.w,
        r.h
    )
    self:drawControlText(label, r2, ____exports.ColorId.Text, 0)
    return state
end
function Context.prototype.text(self, text)
    local spaceWidth = self:textWidth(self.style.font, " ")
    local font = self.style.font
    local color = self.style.colors[____exports.ColorId.Text]
    self:layoutBeginColumn()
    self:layoutRow(
        {-1},
        self:textHeight(font)
    )
    local start = 0
    local ____end = 0
    local p = 0
    while true do
        local r = self:layoutNext()
        local currentLineWidth = 0
        ____end = p
        start = ____end
        while true do
            local wordStart = p
            local pChar
            while true do
                pChar = __TS__StringCharAt(text, p)
                if #pChar == 0 or pChar == " " or pChar == "\n" then
                    break
                end
                p = p + 1
            end
            currentLineWidth = currentLineWidth + self:textWidth(
                font,
                __TS__StringSlice(text, wordStart, p)
            )
            if currentLineWidth > r.w and ____end ~= start then
                break
            end
            if pChar == " " then
                currentLineWidth = currentLineWidth + spaceWidth
            end
            local ____p_45 = p
            p = ____p_45 + 1
            ____end = ____p_45
            local endChar = __TS__StringCharAt(text, ____end)
            if #endChar == 0 or endChar == "\n" then
                break
            end
        end
        self:drawText(
            font,
            __TS__StringSlice(text, start, ____end),
            nil,
            {x = r.x, y = r.y},
            color
        )
        p = ____end + 1
        if ____end >= #text then
            break
        end
    end
    self:layoutEndColumn()
end
function Context.prototype.textbox(self, identifier, buf, opt, responseHandler)
    if opt == nil then
        opt = ____exports.Option.None
    end
    local id = self:getId(identifier)
    local r = self:layoutNext()
    local res, newBuf = table.unpack(self:textboxRaw(
        buf,
        nil,
        id,
        r,
        opt
    ))
    if responseHandler ~= nil then
        responseHandler(nil, res, newBuf)
    end
    return newBuf
end
function Context.prototype.beginPanel(self, name, opt)
    if opt == nil then
        opt = ____exports.Option.None
    end
    local id = self:getId(name)
    local ____self_idStack_46 = self.idStack
    ____self_idStack_46[#____self_idStack_46 + 1] = id
    if self.lastId == nil then
        error("attempted to begin panel with no parent container")
    end
    local cnt = self:getContainer(self.lastId, opt)
    if cnt == nil then
        error("panel must never be closed!")
    end
    cnt.rect = self:layoutNext()
    if opt & ____exports.Option.NoFrame == 0 then
        self:drawFrame(cnt.rect, ____exports.ColorId.PanelBG)
    end
    local ____self_containerStack_47 = self.containerStack
    ____self_containerStack_47[#____self_containerStack_47 + 1] = cnt
    self:pushContainerBody(cnt, cnt.rect, opt)
    self:pushClipRect(cnt.body)
end
function Context.prototype.endPanel(self)
    self:popClipRect()
    self:popContainer()
end
return ____exports
 end,
["lua_modules.reaper-microui.build.hash"] = function(...) 
--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local json = require("lua_modules.reaper-microui.node_modules.json.index")
____exports.HASH_INITIAL = 2166136261
function ____exports.hashString(self, h, data)
    do
        local i = 0
        while i < #data do
            local byte = string.byte(data, i + 1)
            h = (h ~ byte) * 16777619
            i = i + 1
        end
    end
    return h
end
--- Generate a consistent hash based on an initial ID and some data.
-- The same ID-data pair should return the same hash.
-- 
-- https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
function ____exports.hashObject(self, h, data)
    return ____exports.hashString(
        nil,
        h,
        json.encode(data)
    )
end
return ____exports
 end,
["lua_modules.reaper-microui.node_modules.json.index"] = function(...) 
--
-- json.lua
--
-- Copyright (c) 2020 rxi
--
-- Permission is hereby granted, free of charge, to any person obtaining a copy of
-- this software and associated documentation files (the "Software"), to deal in
-- the Software without restriction, including without limitation the rights to
-- use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
-- of the Software, and to permit persons to whom the Software is furnished to do
-- so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in all
-- copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE.
--

local json = { _version = "0.1.2" }

-------------------------------------------------------------------------------
-- Encode
-------------------------------------------------------------------------------

local encode

local escape_char_map = {
	["\\"] = "\\",
	['"'] = '"',
	["\b"] = "b",
	["\f"] = "f",
	["\n"] = "n",
	["\r"] = "r",
	["\t"] = "t",
}

local escape_char_map_inv = { ["/"] = "/" }
for k, v in pairs(escape_char_map) do
	escape_char_map_inv[v] = k
end

local function escape_char(c)
	return "\\" .. (escape_char_map[c] or string.format("u%04x", c:byte()))
end

local function encode_nil(val)
	return "null"
end

local function encode_table(val, stack)
	local res = {}
	stack = stack or {}

	-- Circular reference?
	if stack[val] then
		error("circular reference")
	end

	stack[val] = true

	if rawget(val, 1) ~= nil or next(val) == nil then
		-- Treat as array -- check keys are valid and it is not sparse
		local n = 0
		for k in pairs(val) do
			if type(k) ~= "number" then
				error("invalid table: mixed or invalid key types")
			end
			n = n + 1
		end
		if n ~= #val then
			error("invalid table: sparse array")
		end
		-- Encode
		for i, v in ipairs(val) do
			table.insert(res, encode(v, stack))
		end
		stack[val] = nil
		return "[" .. table.concat(res, ",") .. "]"
	else
		-- Treat as an object
		for k, v in pairs(val) do
			if type(k) ~= "string" then
				error("invalid table: mixed or invalid key types")
			end
			table.insert(res, encode(k, stack) .. ":" .. encode(v, stack))
		end
		stack[val] = nil
		return "{" .. table.concat(res, ",") .. "}"
	end
end

local function encode_string(val)
	return '"' .. val:gsub('[%z\1-\31\\"]', escape_char) .. '"'
end

local function encode_number(val)
	-- Check for NaN, -inf and inf
	if val ~= val or val <= -math.huge or val >= math.huge then
		error("unexpected number value '" .. tostring(val) .. "'")
	end
	return string.format("%.14g", val)
end

local type_func_map = {
	["nil"] = encode_nil,
	["table"] = encode_table,
	["string"] = encode_string,
	["number"] = encode_number,
	["boolean"] = tostring,
}

encode = function(val, stack)
	local t = type(val)
	local f = type_func_map[t]
	if f then
		return f(val, stack)
	end
	error("unexpected type '" .. t .. "'")
end

function json.encode(val)
	return (encode(val))
end

-------------------------------------------------------------------------------
-- Decode
-------------------------------------------------------------------------------

local parse

local function create_set(...)
	local res = {}
	for i = 1, select("#", ...) do
		res[select(i, ...)] = true
	end
	return res
end

local space_chars = create_set(" ", "\t", "\r", "\n")
local delim_chars = create_set(" ", "\t", "\r", "\n", "]", "}", ",")
local escape_chars = create_set("\\", "/", '"', "b", "f", "n", "r", "t", "u")
local literals = create_set("true", "false", "null")

local literal_map = {
	["true"] = true,
	["false"] = false,
	["null"] = nil,
}

local function next_char(str, idx, set, negate)
	for i = idx, #str do
		if set[str:sub(i, i)] ~= negate then
			return i
		end
	end
	return #str + 1
end

local function decode_error(str, idx, msg)
	local line_count = 1
	local col_count = 1
	for i = 1, idx - 1 do
		col_count = col_count + 1
		if str:sub(i, i) == "\n" then
			line_count = line_count + 1
			col_count = 1
		end
	end
	error(string.format("%s at line %d col %d", msg, line_count, col_count))
end

local function codepoint_to_utf8(n)
	-- http://scripts.sil.org/cms/scripts/page.php?site_id=nrsi&id=iws-appendixa
	local f = math.floor
	if n <= 0x7f then
		return string.char(n)
	elseif n <= 0x7ff then
		return string.char(f(n / 64) + 192, n % 64 + 128)
	elseif n <= 0xffff then
		return string.char(f(n / 4096) + 224, f(n % 4096 / 64) + 128, n % 64 + 128)
	elseif n <= 0x10ffff then
		return string.char(f(n / 262144) + 240, f(n % 262144 / 4096) + 128, f(n % 4096 / 64) + 128, n % 64 + 128)
	end
	error(string.format("invalid unicode codepoint '%x'", n))
end

local function parse_unicode_escape(s)
	local n1 = tonumber(s:sub(1, 4), 16)
	local n2 = tonumber(s:sub(7, 10), 16)
	-- Surrogate pair?
	if n2 then
		return codepoint_to_utf8((n1 - 0xd800) * 0x400 + (n2 - 0xdc00) + 0x10000)
	else
		return codepoint_to_utf8(n1)
	end
end

local function parse_string(str, i)
	local res = ""
	local j = i + 1
	local k = j

	while j <= #str do
		local x = str:byte(j)

		if x < 32 then
			decode_error(str, j, "control character in string")
		elseif x == 92 then -- `\`: Escape
			res = res .. str:sub(k, j - 1)
			j = j + 1
			local c = str:sub(j, j)
			if c == "u" then
				local hex = str:match("^[dD][89aAbB]%x%x\\u%x%x%x%x", j + 1)
					or str:match("^%x%x%x%x", j + 1)
					or decode_error(str, j - 1, "invalid unicode escape in string")
				res = res .. parse_unicode_escape(hex)
				j = j + #hex
			else
				if not escape_chars[c] then
					decode_error(str, j - 1, "invalid escape char '" .. c .. "' in string")
				end
				res = res .. escape_char_map_inv[c]
			end
			k = j + 1
		elseif x == 34 then -- `"`: End of string
			res = res .. str:sub(k, j - 1)
			return res, j + 1
		end

		j = j + 1
	end

	decode_error(str, i, "expected closing quote for string")
end

local function parse_number(str, i)
	local x = next_char(str, i, delim_chars)
	local s = str:sub(i, x - 1)
	local n = tonumber(s)
	if not n then
		decode_error(str, i, "invalid number '" .. s .. "'")
	end
	return n, x
end

local function parse_literal(str, i)
	local x = next_char(str, i, delim_chars)
	local word = str:sub(i, x - 1)
	if not literals[word] then
		decode_error(str, i, "invalid literal '" .. word .. "'")
	end
	return literal_map[word], x
end

local function parse_array(str, i)
	local res = {}
	local n = 1
	i = i + 1
	while 1 do
		local x
		i = next_char(str, i, space_chars, true)
		-- Empty / end of array?
		if str:sub(i, i) == "]" then
			i = i + 1
			break
		end
		-- Read token
		x, i = parse(str, i)
		res[n] = x
		n = n + 1
		-- Next token
		i = next_char(str, i, space_chars, true)
		local chr = str:sub(i, i)
		i = i + 1
		if chr == "]" then
			break
		end
		if chr ~= "," then
			decode_error(str, i, "expected ']' or ','")
		end
	end
	return res, i
end

local function parse_object(str, i)
	local res = {}
	i = i + 1
	while 1 do
		local key, val
		i = next_char(str, i, space_chars, true)
		-- Empty / end of object?
		if str:sub(i, i) == "}" then
			i = i + 1
			break
		end
		-- Read key
		if str:sub(i, i) ~= '"' then
			decode_error(str, i, "expected string for key")
		end
		key, i = parse(str, i)
		-- Read ':' delimiter
		i = next_char(str, i, space_chars, true)
		if str:sub(i, i) ~= ":" then
			decode_error(str, i, "expected ':' after key")
		end
		i = next_char(str, i + 1, space_chars, true)
		-- Read value
		val, i = parse(str, i)
		-- Set
		res[key] = val
		-- Next token
		i = next_char(str, i, space_chars, true)
		local chr = str:sub(i, i)
		i = i + 1
		if chr == "}" then
			break
		end
		if chr ~= "," then
			decode_error(str, i, "expected '}' or ','")
		end
	end
	return res, i
end

local char_func_map = {
	['"'] = parse_string,
	["0"] = parse_number,
	["1"] = parse_number,
	["2"] = parse_number,
	["3"] = parse_number,
	["4"] = parse_number,
	["5"] = parse_number,
	["6"] = parse_number,
	["7"] = parse_number,
	["8"] = parse_number,
	["9"] = parse_number,
	["-"] = parse_number,
	["t"] = parse_literal,
	["f"] = parse_literal,
	["n"] = parse_literal,
	["["] = parse_array,
	["{"] = parse_object,
}

parse = function(str, idx)
	local chr = str:sub(idx, idx)
	local f = char_func_map[chr]
	if f then
		return f(str, idx)
	end
	decode_error(str, idx, "unexpected character '" .. chr .. "'")
end

function json.decode(str)
	if type(str) ~= "string" then
		error("expected argument of type string, got " .. type(str))
	end
	local res, idx = parse(str, next_char(str, 1, space_chars, true))
	idx = next_char(str, idx, space_chars, true)
	if idx <= #str then
		decode_error(str, idx, "trailing garbage")
	end
	return res
end

return json
 end,
["lua_modules.reaper-microui.build.deepcopy"] = function(...) 
local exports = {}

--- http://lua-users.org/wiki/CopyTable
local function deepcopy(orig)
	local orig_type = type(orig)
	local copy
	if orig_type == "table" then
		copy = {}
		for orig_key, orig_value in next, orig, nil do
			copy[deepcopy(orig_key)] = deepcopy(orig_value)
		end
		setmetatable(copy, deepcopy(getmetatable(orig)))
	else -- number, string, boolean, etc
		copy = orig
	end
	return copy
end

exports.deepcopy = deepcopy

return exports
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.utils"] = function(...) 
local ____lualib = require("lualib_bundle")
local Error = ____lualib.Error
local RangeError = ____lualib.RangeError
local ReferenceError = ____lualib.ReferenceError
local SyntaxError = ____lualib.SyntaxError
local TypeError = ____lualib.TypeError
local URIError = ____lualib.URIError
local __TS__New = ____lualib.__TS__New
local __TS__Promise = ____lualib.__TS__Promise
local __TS__ParseInt = ____lualib.__TS__ParseInt
local ____exports = {}
local stringOrInspect
local ____inspect = require("lua_modules.reaper-microui.node_modules.reaper-api.inspect")
local inspect = ____inspect.inspect
local path = require("lua_modules.reaper-microui.node_modules.reaper-api.path.path")
function ____exports.log(self, ...)
    local args = {...}
    do
        local i = 0
        while i < #args do
            if i ~= 0 then
                reaper.ShowConsoleMsg("\t")
            end
            local msg = args[i + 1]
            if type(msg) ~= "string" then
                msg = inspect(msg)
            end
            if msg == "" then
            else
                reaper.ShowConsoleMsg(msg)
            end
            i = i + 1
        end
    end
    reaper.ShowConsoleMsg("\n")
end
function ____exports.msgBox(self, title, msg)
    reaper.ShowMessageBox(msg, title, 0)
end
function stringOrInspect(self, obj)
    if type(obj) == "string" then
        return obj
    else
        return inspect(obj)
    end
end
function ____exports.processError(self, e)
    local name = "error"
    local msg = nil
    local stack = nil
    if type(e) == "table" and e ~= nil then
        if e.message ~= nil then
            msg = stringOrInspect(nil, e.message)
        end
        if e.name ~= nil then
            name = stringOrInspect(nil, e.name)
        end
        if e.stack ~= nil then
            stack = stringOrInspect(nil, e.stack)
        end
    else
        msg = stringOrInspect(nil, e)
    end
    return {
        name = name,
        msg = msg,
        stack = stack,
        print = function(self)
            if msg == nil then
                ____exports.log(nil, "error: " .. name)
            else
                ____exports.log(nil, (name .. ": ") .. msg)
            end
            if stack ~= nil then
                ____exports.log(nil, stack)
            end
        end,
        raise = function(self)
            if msg == nil then
                error("error: " .. name)
            else
                error((name .. ": ") .. msg)
            end
        end
    }
end
function ____exports.errorHandler(self, func)
    do
        local function ____catch(e)
            local err = ____exports.processError(nil, e)
            err:print()
            err:raise()
        end
        local ____try, ____hasReturned = pcall(function()
            local rv = func(nil)
            if rv then
                rv:catch(function(____, e)
                    local err = ____exports.processError(nil, e)
                    err:print()
                    err:raise()
                end)
            end
        end)
        if not ____try then
            ____catch(____hasReturned)
        end
    end
end
function ____exports.ensureAPI(self, source, functionName)
    if reaper.APIExists(functionName) then
        return
    end
    local msg = ((source .. " is required for this script to work! (missing function: ") .. functionName) .. ")"
    ____exports.msgBox(nil, "Missing extensions", msg)
    error(
        __TS__New(Error, msg),
        0
    )
end
function ____exports.clearConsole(self)
    reaper.ShowConsoleMsg("")
end
function ____exports.deferLoop(self, func, cleanup)
    local shouldStop = false
    local function stop(self)
        shouldStop = true
    end
    local function inner()
        do
            local function ____catch(e)
                return true
            end
            local ____try, ____hasReturned, ____returnValue = pcall(function()
                ____exports.errorHandler(
                    nil,
                    function() return func(nil, stop) end
                )
            end)
            if not ____try then
                ____hasReturned, ____returnValue = ____catch(____hasReturned)
            end
            if ____hasReturned then
                return ____returnValue
            end
        end
        if shouldStop then
            if cleanup ~= nil then
                do
                    local function ____catch(e)
                        return true
                    end
                    local ____try, ____hasReturned, ____returnValue = pcall(function()
                        ____exports.errorHandler(
                            nil,
                            function() return cleanup(nil) end
                        )
                    end)
                    if not ____try then
                        ____hasReturned, ____returnValue = ____catch(____hasReturned)
                    end
                    if ____hasReturned then
                        return ____returnValue
                    end
                end
            end
            return
        end
        reaper.defer(inner)
    end
    inner()
end
function ____exports.deferAsync(self)
    return __TS__New(
        __TS__Promise,
        function(____, resolve) return reaper.defer(function() return resolve(nil, nil) end) end
    )
end
function ____exports.confirmBox(self, title, msg)
    local rv = reaper.ShowMessageBox(msg, title, 4)
    return rv == 6
end
--- flags: (from https://forum.cockos.com/showthread.php?t=185118)
-- ```plain
-- -1: All undo info
-- 0: ???? When only calling actions via OnCommand, since these create their own undo points
-- 1: track configurations (track/master vol/pan/routing, ALL envelopes (master included))
-- 2: track/master FX
-- 4: track items
-- 8: project states (loop selection, markers, regions)
-- 16: freeze states
-- ```
function ____exports.undoBlock(self, desc, flags, func)
    reaper.Undo_BeginBlock2(0)
    reaper.PreventUIRefresh(1)
    local ____error = nil
    do
        local function ____catch(e)
            ____error = e
        end
        local ____try, ____hasReturned = pcall(function()
            local config = func(nil)
            if config and config.desc ~= nil then
                desc = config.desc
            end
            if config and config.flags ~= nil then
                flags = config.flags
            end
        end)
        if not ____try then
            ____catch(____hasReturned)
        end
    end
    reaper.PreventUIRefresh(-1)
    reaper.Undo_EndBlock2(0, desc, flags)
    if ____error ~= nil then
        error(____error, 0)
    end
end
function ____exports.assertUnreachable(self, x)
    error(
        __TS__New(Error, "Didn't expect to get here"),
        0
    )
end
function ____exports.readFile(self, path)
    local f, err = io.open(path, "rb")
    if f == nil then
        error(
            __TS__New(Error, err),
            0
        )
    end
    local content = f:read("*all")
    f:close()
    if type(content) ~= "string" then
        error(
            __TS__New(Error, "file read returned nonstring value"),
            0
        )
    end
    return content
end
function ____exports.writeFile(self, path, text)
    local f, err = io.open(path, "w")
    if f == nil then
        error(
            __TS__New(Error, err),
            0
        )
    end
    f:write(text)
    f:close()
end
function ____exports.getReaperVersion(self)
    local match = {string.match(
        reaper.GetAppVersion(),
        "^(%d+).(%d+)"
    )}
    if #match == 0 then
        return nil
    end
    local major, minor = table.unpack(match)
    return {
        major = __TS__ParseInt(major),
        minor = __TS__ParseInt(minor)
    }
end
function ____exports.getReaperDataFile(self, filename)
    local parentDir = reaper.GetResourcePath()
    if filename then
        return path.normpath(path.join(parentDir, filename))
    else
        return path.normpath(parentDir)
    end
end
function ____exports.runMainAction(self, action, project)
    if type(action) == "string" then
        action = reaper.NamedCommandLookup(action)
    end
    reaper.Main_OnCommandEx(action, 0, project or 0)
end
function ____exports.runMidiAction(self, action, target)
    if type(action) == "string" then
        action = reaper.NamedCommandLookup(action)
    end
    if target ~= nil and target.hwnd ~= nil then
        reaper.MIDIEditor_OnCommand(target.hwnd, action)
    else
        reaper.MIDIEditor_LastFocused_OnCommand(action, target and target.listview or false)
    end
end
function ____exports.getActionContext(self)
    local is_new_value, filename, sectionID, cmdID, mode, resolution, val, contextstr = reaper.get_action_context()
    local ____temp_2
    if sectionID == -1 then
        ____temp_2 = nil
    else
        ____temp_2 = {sectionID = sectionID, cmdID = cmdID}
    end
    local action = ____temp_2
    return {filename = filename, action = action}
end
return ____exports
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.path.path"] = function(...) 
--- A port of some functions from Python's os.path module

---@type string
local reaper_os = reaper.GetOS()
local is_windows = reaper_os:sub(1, 3) == "Win"

if is_windows then
  return require("lua_modules.reaper-microui.node_modules.reaper-api.path.ntpath")
else
  return require("lua_modules.reaper-microui.node_modules.reaper-api.path.posixpath")
end
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.path.posixpath"] = function(...) 
-- port of os.path for Linux-based systems

local util = require("lua_modules.reaper-microui.node_modules.reaper-api.path.util")
local common = require("lua_modules.reaper-microui.node_modules.reaper-api.path.genericpath")

local getcwd = common.getcwd
local contains = util.contains

local module = {}

--- Split a pathname into drive and path. On Posix, drive is always empty.
--- @param path string
function module.splitdrive(path)
  return "", path
end

--[[
Join two or more pathname components, inserting '/' as needed.
If any component is an absolute path, all previous path components
will be discarded.  An empty last part will result in a path that
ends with a separator.
--]]
function module.join(a, ...)
  local p = { ... }
  local path = a
  for _, b in ipairs(p) do
    if b:sub(1, 1) == "/" then
      path = b
    elseif #path == 0 or path:sub(-1, -1) == "/" then
      path = path .. b
    else
      path = path .. "/" .. b
    end
  end
  return path
end

--- Split a path in root and extension.
--- The extension is everything starting at the last dot in the last
--- pathname component; the root is everything before that.
--- It is always true that root + ext == p.
function module.splitext(p)
  return common.splitext(p, "/", nil, ".")
end

-- Normalize a path, e.g. A//B, A/./B and A/foo/../B all become A/B.
-- It should be understood that this may change the meaning of the path
-- if it contains symbolic links!

--- Normalize path, eliminating double slashes, etc.
--- @param path string
function module.normpath(path)
  if #path == 0 then
    return "."
  end

  local initial_slashes = path:sub(1, 1) == "/"
  -- POSIX allows one or two initial slashes, but treats three or more as single slash.
  if initial_slashes and path:sub(2, 2) == "/" and not (path:sub(3, 3) == "/") then
    initial_slashes = 2
  end

  local comps = util.split(path, "[^/]*")
  local new_comps = {}
  for _, comp in ipairs(comps) do
    if contains(comp, { "", "." }) then
      goto continue
    end

    if
      comp ~= ".."
      or (not initial_slashes and #new_comps == 0)
      or (#new_comps > 0 and new_comps[#new_comps] == "..")
    then
      table.insert(new_comps, comp)
    elseif #new_comps > 0 then
      table.remove(new_comps)
    end
    ::continue::
  end
  comps = new_comps
  path = table.concat(comps, "/")
  if initial_slashes then
    if initial_slashes == true then
      initial_slashes = 1
    end

    path = ("/"):rep(initial_slashes) .. path
  end

  if #path > 0 then
    return path
  else
    return "."
  end
end

-- Split a path in head (everything up to the last '/') and tail (the
-- rest).  If the path ends in '/', tail will be empty.  If there is no
-- '/' in the path, head  will be empty.
-- Trailing '/'es are stripped from head unless it is the root.

--- Split a pathname.  Returns tuple "(head, tail)" where "tail" is
--- everything after the final slash.  Either part may be empty.
--- @param p string
function module.split(p)
  local sep_pos = ({ p:find(".*/") })[2] or 0
  local head, tail = p:sub(1, sep_pos), p:sub(sep_pos + 1)
  if #head > 0 and head ~= ("/"):rep(#head) then
    -- remove trailing slashes from head, unless it's all slashes
    -- https://stackoverflow.com/questions/17386792/how-to-implement-string-rfind-in-lua
    head = head:match("(.*[^/\\])") or head
  end
  return head, tail
end

-- Return whether a path is absolute.
-- Trivial in Posix, harder on the Mac or MS-DOS.

--- Test whether a path is absolute
function module.isabs(s)
  return s:sub(1, 1) == "/"
end

--- Return an absolute path.
--- @param path string
function module.abspath(path)
  if not module.isabs(path) then
    local cwd = getcwd()
    path = module.join(cwd, path)
  end
  return module.normpath(path)
end

--- Normalize case of pathname.  Has no effect under Posix
--- @param s string
function module.normcase(s)
  return s
end

--- Return a relative version of a path
--- @param path string
--- @param start string|nil
function module.relpath(path, start)
  if #path == 0 then
    return nil, "Given path is empty!"
  end

  if start == nil then
    start = "."
  end

  start = module.abspath(start)
  path = module.abspath(path)

  local start_list = {}
  for _, p in ipairs(util.split(start, "[^/]*")) do
    if #p > 0 then
      table.insert(start_list, p)
    end
  end

  local path_list = {}
  for _, p in ipairs(util.split(path, "[^/]*")) do
    if #p > 0 then
      table.insert(path_list, p)
    end
  end

  -- Work out how much of the filepath is shared by start and path.
  local i = 1
  for k = 1, math.min(#start_list, #path_list) do
    if start_list[k] ~= path_list[k] then
      break
    end
    i = k + 1
  end

  local rel_list = {}
  for j = 1, #start_list - i + 1 do
    rel_list[j] = ".."
  end
  local j = #rel_list + 1
  for k = i, #path_list do
    rel_list[j] = path_list[k]
    j = j + 1
  end

  if #rel_list == 0 then
    return "."
  end
  return module.join(table.unpack(rel_list))
end

return module
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.path.genericpath"] = function(...) 
local module = {}

function module.splitext(p, sep, altsep, extsep)
	for i, x in ipairs({ sep, altsep, extsep }) do
		assert(#x == 1, "Input separator must be a single char")
	end

	local sepIndex = ({ p:find(".*%" .. sep) })[2] or 0

	if altsep ~= nil then
		local altsepIndex = ({ p:find(".*%" .. altsep) })[2] or 0
		sepIndex = math.max(sepIndex, altsepIndex)
	end

	local dotIndex = ({ p:find(".*%" .. extsep) })[2] or 0
	if dotIndex > sepIndex then
		-- skip all leading dots
		local filenameIndex = sepIndex + 1
		while filenameIndex < dotIndex do
			if p:sub(filenameIndex, filenameIndex) ~= extsep then
				return p:sub(1, dotIndex - 1), p:sub(dotIndex)
			end
			filenameIndex = filenameIndex + 1
		end
	end

	return p, ""
end

--- Get the current working directory
--- There is no native function to do this, you MUST use an external library for this
function module.getcwd()
	return reaper.GetExePath()
end

return module
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.path.util"] = function(...) 
local module = {}

function module.contains(val, arr)
  for _, x in ipairs(arr) do
    if val == x then
      return true
    end
  end
  return false
end

-- http://lua-users.org/wiki/SplitJoin

-- local str = "a,,b"     -- comma-separated list
-- local pat = "[^,]*"    -- everything except commas
-- assert (table.concat(split(str, pat), ",") == str)

-- splits 'str' into pieces matching 'pat', returns them as an array
-- the following minimalistic splitting function now is a true inverse of table.concat
function module.split(str, pat)
  local tbl = {}
  str:gsub(pat, function(x)
    tbl[#tbl + 1] = x
  end)
  return tbl
end

return module
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.path.ntpath"] = function(...) 
-- port of os.path for Windows

local util = require("lua_modules.reaper-microui.node_modules.reaper-api.path.util")
local common = require("lua_modules.reaper-microui.node_modules.reaper-api.path.genericpath")

local getcwd = common.getcwd
local contains = util.contains

local module = {}

function module.splitext(p)
  return common.splitext(p, "\\", "/", ".")
end

--- @param path string
function module.splitdrive(path)
  if #path >= 2 then
    -- normalized path, by replacing all forward slashes with backslashes
    local npath = path:gsub("/", "\\")
    if npath:sub(1, 2) == "\\\\" and npath:sub(3, 3) ~= "\\" then
      -- this is a UNC path (starts with 2 backslashes)

      -- |---drive letter---|
      -- \\machine\mountpoint\directory\etc\...
      --                     |---directory----|

      local first_sep = npath:find("\\", 3)
      if first_sep == nil then
        return "", path
      end

      -- a UNC path can't have 2 slashes in a row (other than the first two)
      local second_sep = npath:find("\\", first_sep + 1)
      if second_sep == first_sep + 1 then
        return "", path
      end

      if second_sep == nil then
        return path, ""
      else
        return path:sub(1, second_sep - 1), path:sub(second_sep)
      end
    end

    if path:sub(2, 2) == ":" then
      return path:sub(1, 2), path:sub(3)
    end
  end

  return "", path
end

function module.join(path, ...)
  local paths = { ... }

  local result_drive, result_path = module.splitdrive(path)

  -- iterate for 2nd path onwards
  for _, p in ipairs(paths) do
    local p_drive, p_path = module.splitdrive(p)
    if #p_path > 0 and contains(p_path:sub(1, 1), { "\\", "/" }) then
      -- second path is absolute
      if #p_drive > 0 or #result_drive == 0 then
        result_drive = p_drive
      end

      result_path = p_path
      goto continue
    elseif #p_drive > 0 and p_drive ~= result_drive then
      if p_drive:lower() ~= result_drive:lower() then
        -- Different drives => ignore the first path entirely
        result_drive = p_drive
        result_path = p_path
        goto continue
      end
      -- Same drive in different case
      result_drive = p_drive
    end
    -- Second path is relative to the first
    if #result_path > 0 and not contains(result_path:sub(-1, -1), { "\\", "/" }) then
      result_path = result_path .. "\\"
    end
    result_path = result_path .. p_path
    ::continue::
  end
  -- add separator between UNC and non-absolute path
  if
    #result_path > 0
    and not contains(result_path:sub(1, 1), { "\\", "/" })
    and #result_drive > 0
    and result_drive:sub(-1, -1) ~= ":"
  then
    return result_drive .. "\\" .. result_path
  end

  return result_drive .. result_path
end

-- Normalize a path, e.g. A//B, A/./B and A/foo/../B all become A\B.
-- Previously, this function also truncated pathnames to 8+3 format,
-- but as this module is called "ntpath", that's obviously wrong!

--- Normalize path, eliminating double slashes, etc.
function module.normpath(path)
  if contains(path:sub(1, 4), { [[\\.\]], [[\\?\]] }) then
    -- in the case of paths with these prefixes:
    -- \\.\ -> device names
    -- \\?\ -> literal paths
    -- do not do any normalization, but return the path
    -- unchanged apart from the call to os.fspath()
    return path
  end

  path = path:gsub("/", "\\")
  local prefix, path = module.splitdrive(path)

  -- collapse initial backslashes
  if path:sub(1, 1) == "\\" then
    prefix = prefix .. "\\"

    path = ({ path:gsub("^\\+", "") })[1]
  end

  -- split by separator into list
  local comps = util.split(path, "[^\\\\]*")
  local i = 1
  while i <= #comps do
    if #comps[i] == 0 or comps[i] == "." then
      table.remove(comps, i)
    elseif comps[i] == ".." then
      if i > 1 and comps[i - 1] ~= ".." then
        for _ = 0, 1 do -- do twice
          table.remove(comps, i - 1)
        end
        i = i - 1
      elseif i == 1 and prefix:sub(-1, -1) == "\\" then
        table.remove(comps, i)
      else
        i = i + 1
      end
    else
      i = i + 1
    end
  end
  -- If the path is now empty, substitute '.'
  if #prefix == 0 and #comps == 0 then
    comps[#comps + 1] = "."
  end
  return prefix .. table.concat(comps, "\\")
end

--- Split a pathname.
--- Return tuple (head, tail) where tail is everything after the final slash.
--- Either part may be empty.
--- @param p string
function module.split(p)
  local d, p = module.splitdrive(p)
  -- set i to index beyond p's last slash
  local i = #p + 1
  while i ~= 1 and not contains(p:sub(i - 1, i - 1), { "/", "\\" }) do
    i = i - 1
  end
  local head, tail = p:sub(1, i - 1), p:sub(i) -- now tail has no slashes
  -- remove trailing slashes from head, unless it's all slashes
  -- https://stackoverflow.com/questions/17386792/how-to-implement-string-rfind-in-lua
  head = head:match("(.*[^/\\])") or head
  return d .. head, tail
end

--- Test whether a path is absolute
--- @param path string
function module.isabs(path)
  -- Paths beginning with \\?\ are always absolute, but do not necessarily contain a drive.
  local ABS_PATTERN = [[\\?\]]
  if path:gsub("/", "\\"):sub(1, 4) == ABS_PATTERN then
    return true
  end

  _, path = module.splitdrive(path)
  return #path > 0 and contains(path:sub(1, 1), { "/", "\\" })
end

--- Return an absolute path.
--- @param path string
function module.abspath(path)
  if not module.isabs(path) then
    local cwd = getcwd()
    path = module.join(cwd, path)
  end
  return module.normpath(path)
end

--- Normalize case of pathname.
--- Makes all characters lowercase and all slashes into backslashes.
--- @param s string
function module.normcase(s)
  return s:gsub("/", "\\"):lower()
end

--- Return a relative version of a path
function module.relpath(path, start)
  if #path == 0 then
    return nil, "Given path is empty!"
  end

  if start == nil then
    start = "."
  end

  local start_abs = module.abspath(module.normpath(start))
  local path_abs = module.abspath(module.normpath(path))
  local start_drive, start_rest = module.splitdrive(start_abs)
  local path_drive, path_rest = module.splitdrive(path_abs)
  if module.normcase(start_drive) ~= module.normcase(path_drive) then
    return nil, ("path is on mount %r, start on mount %r"):format(path_drive, start_drive)
  end

  local start_list = {}
  for _, p in ipairs(util.split(start_rest, "[^\\]*")) do
    if #p > 0 then
      table.insert(start_list, p)
    end
  end

  local path_list = {}
  for _, p in ipairs(util.split(path_rest, "[^\\]*")) do
    if #p > 0 then
      table.insert(path_list, p)
    end
  end

  -- Work out how much of the filepath is shared by start and path.
  local i = 1
  for k = 1, math.min(#start_list, #path_list) do
    if module.normcase(start_list[k]) ~= module.normcase(path_list[k]) then
      break
    end
    i = k + 1
  end

  local rel_list = {}
  for j = 1, #start_list - i + 1 do
    rel_list[j] = ".."
  end
  local j = #rel_list + 1
  for k = i, #path_list do
    rel_list[j] = path_list[k]
    j = j + 1
  end

  if #rel_list == 0 then
    return "."
  end
  return module.join(table.unpack(rel_list))
end

return module
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.inspect"] = function(...) 
local _tl_compat; if (tonumber((_VERSION or ''):match('[%d.]*$')) or 0) < 5.3 then local p, m = pcall(require, 'compat53.module'); if p then _tl_compat = m end end; local math = _tl_compat and _tl_compat.math or math; local string = _tl_compat and _tl_compat.string or string; local table = _tl_compat and _tl_compat.table or table
local inspect = {Options = {}, }

















inspect._VERSION = 'inspect.lua 3.1.0'
inspect._URL = 'http://github.com/kikito/inspect.lua'
inspect._DESCRIPTION = 'human-readable representations of tables'
inspect._LICENSE = [[
  MIT LICENSE

  Copyright (c) 2022 Enrique García Cota

  Permission is hereby granted, free of charge, to any person obtaining a
  copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:

  The above copyright notice and this permission notice shall be included
  in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
]]
inspect.KEY = setmetatable({}, { __tostring = function() return 'inspect.KEY' end })
inspect.METATABLE = setmetatable({}, { __tostring = function() return 'inspect.METATABLE' end })

local tostring = tostring
local rep = string.rep
local match = string.match
local char = string.char
local gsub = string.gsub
local fmt = string.format

local _rawget
if rawget then
   _rawget = rawget
else
   _rawget = function(t, k) return t[k] end
end

local function rawpairs(t)
   return next, t, nil
end



local function smartQuote(str)
   if match(str, '"') and not match(str, "'") then
      return "'" .. str .. "'"
   end
   return '"' .. gsub(str, '"', '\\"') .. '"'
end


local shortControlCharEscapes = {
   ["\a"] = "\\a", ["\b"] = "\\b", ["\f"] = "\\f", ["\n"] = "\\n",
   ["\r"] = "\\r", ["\t"] = "\\t", ["\v"] = "\\v", ["\127"] = "\\127",
}
local longControlCharEscapes = { ["\127"] = "\127" }
for i = 0, 31 do
   local ch = char(i)
   if not shortControlCharEscapes[ch] then
      shortControlCharEscapes[ch] = "\\" .. i
      longControlCharEscapes[ch] = fmt("\\%03d", i)
   end
end

local function escape(str)
   return (gsub(gsub(gsub(str, "\\", "\\\\"),
   "(%c)%f[0-9]", longControlCharEscapes),
   "%c", shortControlCharEscapes))
end

local luaKeywords = {
   ['and'] = true,
   ['break'] = true,
   ['do'] = true,
   ['else'] = true,
   ['elseif'] = true,
   ['end'] = true,
   ['false'] = true,
   ['for'] = true,
   ['function'] = true,
   ['goto'] = true,
   ['if'] = true,
   ['in'] = true,
   ['local'] = true,
   ['nil'] = true,
   ['not'] = true,
   ['or'] = true,
   ['repeat'] = true,
   ['return'] = true,
   ['then'] = true,
   ['true'] = true,
   ['until'] = true,
   ['while'] = true,
}

local function isIdentifier(str)
   return type(str) == "string" and
   not not str:match("^[_%a][_%a%d]*$") and
   not luaKeywords[str]
end

local flr = math.floor
local function isSequenceKey(k, sequenceLength)
   return type(k) == "number" and
   flr(k) == k and
   1 <= (k) and
   k <= sequenceLength
end

local defaultTypeOrders = {
   ['number'] = 1, ['boolean'] = 2, ['string'] = 3, ['table'] = 4,
   ['function'] = 5, ['userdata'] = 6, ['thread'] = 7,
}

local function sortKeys(a, b)
   local ta, tb = type(a), type(b)


   if ta == tb and (ta == 'string' or ta == 'number') then
      return (a) < (b)
   end

   local dta = defaultTypeOrders[ta] or 100
   local dtb = defaultTypeOrders[tb] or 100


   return dta == dtb and ta < tb or dta < dtb
end

local function getKeys(t)

   local seqLen = 1
   while _rawget(t, seqLen) ~= nil do
      seqLen = seqLen + 1
   end
   seqLen = seqLen - 1

   local keys, keysLen = {}, 0
   for k in rawpairs(t) do
      if not isSequenceKey(k, seqLen) then
         keysLen = keysLen + 1
         keys[keysLen] = k
      end
   end
   table.sort(keys, sortKeys)
   return keys, keysLen, seqLen
end

local function countCycles(x, cycles)
   if type(x) == "table" then
      if cycles[x] then
         cycles[x] = cycles[x] + 1
      else
         cycles[x] = 1
         for k, v in rawpairs(x) do
            countCycles(k, cycles)
            countCycles(v, cycles)
         end
         countCycles(getmetatable(x), cycles)
      end
   end
end

local function makePath(path, a, b)
   local newPath = {}
   local len = #path
   for i = 1, len do newPath[i] = path[i] end

   newPath[len + 1] = a
   newPath[len + 2] = b

   return newPath
end


local function processRecursive(process,
   item,
   path,
   visited)
   if item == nil then return nil end
   if visited[item] then return visited[item] end

   local processed = process(item, path)
   if type(processed) == "table" then
      local processedCopy = {}
      visited[item] = processedCopy
      local processedKey

      for k, v in rawpairs(processed) do
         processedKey = processRecursive(process, k, makePath(path, k, inspect.KEY), visited)
         if processedKey ~= nil then
            processedCopy[processedKey] = processRecursive(process, v, makePath(path, processedKey), visited)
         end
      end

      local mt = processRecursive(process, getmetatable(processed), makePath(path, inspect.METATABLE), visited)
      if type(mt) ~= 'table' then mt = nil end
      setmetatable(processedCopy, mt)
      processed = processedCopy
   end
   return processed
end

local function puts(buf, str)
   buf.n = buf.n + 1
   buf[buf.n] = str
end



local Inspector = {}










local Inspector_mt = { __index = Inspector }

local function tabify(inspector)
   puts(inspector.buf, inspector.newline .. rep(inspector.indent, inspector.level))
end

function Inspector:getId(v)
   local id = self.ids[v]
   local ids = self.ids
   if not id then
      local tv = type(v)
      id = (ids[tv] or 0) + 1
      ids[v], ids[tv] = id, id
   end
   return tostring(id)
end

function Inspector:putValue(v)
   local buf = self.buf
   local tv = type(v)
   if tv == 'string' then
      puts(buf, smartQuote(escape(v)))
   elseif tv == 'number' or tv == 'boolean' or tv == 'nil' or
      tv == 'cdata' or tv == 'ctype' then
      puts(buf, tostring(v))
   elseif tv == 'table' and not self.ids[v] then
      local t = v

      if t == inspect.KEY or t == inspect.METATABLE then
         puts(buf, tostring(t))
      elseif self.level >= self.depth then
         puts(buf, '{...}')
      else
         if self.cycles[t] > 1 then puts(buf, fmt('<%d>', self:getId(t))) end

         local keys, keysLen, seqLen = getKeys(t)

         puts(buf, '{')
         self.level = self.level + 1

         for i = 1, seqLen + keysLen do
            if i > 1 then puts(buf, ',') end
            if i <= seqLen then
               puts(buf, ' ')
               self:putValue(t[i])
            else
               local k = keys[i - seqLen]
               tabify(self)
               if isIdentifier(k) then
                  puts(buf, k)
               else
                  puts(buf, "[")
                  self:putValue(k)
                  puts(buf, "]")
               end
               puts(buf, ' = ')
               self:putValue(t[k])
            end
         end

         local mt = getmetatable(t)
         if type(mt) == 'table' then
            if seqLen + keysLen > 0 then puts(buf, ',') end
            tabify(self)
            puts(buf, '<metatable> = ')
            self:putValue(mt)
         end

         self.level = self.level - 1

         if keysLen > 0 or type(mt) == 'table' then
            tabify(self)
         elseif seqLen > 0 then
            puts(buf, ' ')
         end

         puts(buf, '}')
      end

   else
      puts(buf, fmt('<%s %d>', tv, self:getId(v)))
   end
end




function inspect.inspect(root, options)
   options = options or {}

   local depth = options.depth or (math.huge)
   local newline = options.newline or '\n'
   local indent = options.indent or '  '
   local process = options.process

   if process then
      root = processRecursive(process, root, {}, {})
   end

   local cycles = {}
   countCycles(root, cycles)

   local inspector = setmetatable({
      buf = { n = 0 },
      ids = {},
      cycles = cycles,
      depth = depth,
      level = 0,
      newline = newline,
      indent = indent,
   }, Inspector_mt)

   inspector:putValue(root)

   return table.concat(inspector.buf)
end

setmetatable(inspect, {
   __call = function(_, root, options)
      return inspect.inspect(root, options)
   end,
})

return inspect
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.ffi.index"] = function(...) 
--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
do
    local ____export = require("lua_modules.reaper-microui.node_modules.reaper-api.ffi.enums")
    for ____exportKey, ____exportValue in pairs(____export) do
        if ____exportKey ~= "default" then
            ____exports[____exportKey] = ____exportValue
        end
    end
end
return ____exports
 end,
["lua_modules.reaper-microui.node_modules.reaper-api.ffi.enums"] = function(...) 
--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
____exports.OSType = OSType or ({})
____exports.OSType.Win32 = "Win32"
____exports.OSType.Win64 = "Win64"
____exports.OSType.OSX32 = "OSX32"
____exports.OSType.OSX64 = "OSX64"
____exports.OSType.MacOSArm64 = "macOS-arm64"
____exports.OSType.Other = "Other"
____exports.Mode = Mode or ({})
____exports.Mode.Default = 0
____exports.Mode[____exports.Mode.Default] = "Default"
____exports.Mode.AdditiveBlend = 1
____exports.Mode[____exports.Mode.AdditiveBlend] = "AdditiveBlend"
____exports.Mode.DisableSourceAlpha = 2
____exports.Mode[____exports.Mode.DisableSourceAlpha] = "DisableSourceAlpha"
____exports.Mode.DisableFilterings = 4
____exports.Mode[____exports.Mode.DisableFilterings] = "DisableFilterings"
____exports.MouseCap = MouseCap or ({})
____exports.MouseCap.None = 0
____exports.MouseCap[____exports.MouseCap.None] = "None"
____exports.MouseCap.LeftMouse = 1
____exports.MouseCap[____exports.MouseCap.LeftMouse] = "LeftMouse"
____exports.MouseCap.RightMouse = 2
____exports.MouseCap[____exports.MouseCap.RightMouse] = "RightMouse"
____exports.MouseCap.CommandKey = 4
____exports.MouseCap[____exports.MouseCap.CommandKey] = "CommandKey"
____exports.MouseCap.ShiftKey = 8
____exports.MouseCap[____exports.MouseCap.ShiftKey] = "ShiftKey"
____exports.MouseCap.OptionKey = 16
____exports.MouseCap[____exports.MouseCap.OptionKey] = "OptionKey"
____exports.MouseCap.ControlKey = 32
____exports.MouseCap[____exports.MouseCap.ControlKey] = "ControlKey"
____exports.MouseCap.MiddleMouse = 64
____exports.MouseCap[____exports.MouseCap.MiddleMouse] = "MiddleMouse"
____exports.DrawStrFlags = DrawStrFlags or ({})
____exports.DrawStrFlags.None = 0
____exports.DrawStrFlags[____exports.DrawStrFlags.None] = "None"
____exports.DrawStrFlags.CenterHorizontally = 1
____exports.DrawStrFlags[____exports.DrawStrFlags.CenterHorizontally] = "CenterHorizontally"
____exports.DrawStrFlags.JustifyRight = 2
____exports.DrawStrFlags[____exports.DrawStrFlags.JustifyRight] = "JustifyRight"
____exports.DrawStrFlags.CenterVertically = 4
____exports.DrawStrFlags[____exports.DrawStrFlags.CenterVertically] = "CenterVertically"
____exports.DrawStrFlags.JustifyBottom = 8
____exports.DrawStrFlags[____exports.DrawStrFlags.JustifyBottom] = "JustifyBottom"
____exports.DrawStrFlags.Unbounded = 256
____exports.DrawStrFlags[____exports.DrawStrFlags.Unbounded] = "Unbounded"
return ____exports
 end,
["lua_modules.reaper-api.utils"] = function(...) 
local ____lualib = require("lualib_bundle")
local Error = ____lualib.Error
local RangeError = ____lualib.RangeError
local ReferenceError = ____lualib.ReferenceError
local SyntaxError = ____lualib.SyntaxError
local TypeError = ____lualib.TypeError
local URIError = ____lualib.URIError
local __TS__New = ____lualib.__TS__New
local __TS__Promise = ____lualib.__TS__Promise
local __TS__ParseInt = ____lualib.__TS__ParseInt
local ____exports = {}
local stringOrInspect
local ____inspect = require("lua_modules.reaper-api.inspect")
local inspect = ____inspect.inspect
local path = require("lua_modules.reaper-api.path.path")
function ____exports.log(self, ...)
    local args = {...}
    do
        local i = 0
        while i < #args do
            if i ~= 0 then
                reaper.ShowConsoleMsg("\t")
            end
            local msg = args[i + 1]
            if type(msg) ~= "string" then
                msg = inspect(msg)
            end
            if msg == "" then
            else
                reaper.ShowConsoleMsg(msg)
            end
            i = i + 1
        end
    end
    reaper.ShowConsoleMsg("\n")
end
function ____exports.msgBox(self, title, msg)
    reaper.ShowMessageBox(msg, title, 0)
end
function stringOrInspect(self, obj)
    if type(obj) == "string" then
        return obj
    else
        return inspect(obj)
    end
end
function ____exports.processError(self, e)
    local name = "error"
    local msg = nil
    local stack = nil
    if type(e) == "table" and e ~= nil then
        if e.message ~= nil then
            msg = stringOrInspect(nil, e.message)
        end
        if e.name ~= nil then
            name = stringOrInspect(nil, e.name)
        end
        if e.stack ~= nil then
            stack = stringOrInspect(nil, e.stack)
        end
    else
        msg = stringOrInspect(nil, e)
    end
    return {
        name = name,
        msg = msg,
        stack = stack,
        print = function(self)
            if msg == nil then
                ____exports.log(nil, "error: " .. name)
            else
                ____exports.log(nil, (name .. ": ") .. msg)
            end
            if stack ~= nil then
                ____exports.log(nil, stack)
            end
        end,
        raise = function(self)
            if msg == nil then
                error("error: " .. name)
            else
                error((name .. ": ") .. msg)
            end
        end
    }
end
function ____exports.errorHandler(self, func)
    do
        local function ____catch(e)
            local err = ____exports.processError(nil, e)
            err:print()
            err:raise()
        end
        local ____try, ____hasReturned = pcall(function()
            local rv = func(nil)
            if rv then
                rv:catch(function(____, e)
                    local err = ____exports.processError(nil, e)
                    err:print()
                    err:raise()
                end)
            end
        end)
        if not ____try then
            ____catch(____hasReturned)
        end
    end
end
function ____exports.ensureAPI(self, source, functionName)
    if reaper.APIExists(functionName) then
        return
    end
    local msg = ((source .. " is required for this script to work! (missing function: ") .. functionName) .. ")"
    ____exports.msgBox(nil, "Missing extensions", msg)
    error(
        __TS__New(Error, msg),
        0
    )
end
function ____exports.clearConsole(self)
    reaper.ShowConsoleMsg("")
end
function ____exports.deferLoop(self, func, cleanup)
    local shouldStop = false
    local function stop(self)
        shouldStop = true
    end
    local function inner()
        do
            local function ____catch(e)
                return true
            end
            local ____try, ____hasReturned, ____returnValue = pcall(function()
                ____exports.errorHandler(
                    nil,
                    function() return func(nil, stop) end
                )
            end)
            if not ____try then
                ____hasReturned, ____returnValue = ____catch(____hasReturned)
            end
            if ____hasReturned then
                return ____returnValue
            end
        end
        if shouldStop then
            if cleanup ~= nil then
                do
                    local function ____catch(e)
                        return true
                    end
                    local ____try, ____hasReturned, ____returnValue = pcall(function()
                        ____exports.errorHandler(
                            nil,
                            function() return cleanup(nil) end
                        )
                    end)
                    if not ____try then
                        ____hasReturned, ____returnValue = ____catch(____hasReturned)
                    end
                    if ____hasReturned then
                        return ____returnValue
                    end
                end
            end
            return
        end
        reaper.defer(inner)
    end
    inner()
end
function ____exports.deferAsync(self)
    return __TS__New(
        __TS__Promise,
        function(____, resolve) return reaper.defer(function() return resolve(nil, nil) end) end
    )
end
function ____exports.confirmBox(self, title, msg)
    local rv = reaper.ShowMessageBox(msg, title, 4)
    return rv == 6
end
--- flags: (from https://forum.cockos.com/showthread.php?t=185118)
-- ```plain
-- -1: All undo info
-- 0: ???? When only calling actions via OnCommand, since these create their own undo points
-- 1: track configurations (track/master vol/pan/routing, ALL envelopes (master included))
-- 2: track/master FX
-- 4: track items
-- 8: project states (loop selection, markers, regions)
-- 16: freeze states
-- ```
function ____exports.undoBlock(self, desc, flags, func)
    reaper.Undo_BeginBlock2(0)
    reaper.PreventUIRefresh(1)
    local ____error = nil
    do
        local function ____catch(e)
            ____error = e
        end
        local ____try, ____hasReturned = pcall(function()
            local config = func(nil)
            if config and config.desc ~= nil then
                desc = config.desc
            end
            if config and config.flags ~= nil then
                flags = config.flags
            end
        end)
        if not ____try then
            ____catch(____hasReturned)
        end
    end
    reaper.PreventUIRefresh(-1)
    reaper.Undo_EndBlock2(0, desc, flags)
    if ____error ~= nil then
        error(____error, 0)
    end
end
function ____exports.assertUnreachable(self, x)
    error(
        __TS__New(Error, "Didn't expect to get here"),
        0
    )
end
function ____exports.readFile(self, path)
    local f, err = io.open(path, "rb")
    if f == nil then
        error(
            __TS__New(Error, err),
            0
        )
    end
    local content = f:read("*all")
    f:close()
    if type(content) ~= "string" then
        error(
            __TS__New(Error, "file read returned nonstring value"),
            0
        )
    end
    return content
end
function ____exports.writeFile(self, path, text)
    local f, err = io.open(path, "w")
    if f == nil then
        error(
            __TS__New(Error, err),
            0
        )
    end
    f:write(text)
    f:close()
end
function ____exports.getReaperVersion(self)
    local match = {string.match(
        reaper.GetAppVersion(),
        "^(%d+).(%d+)"
    )}
    if #match == 0 then
        return nil
    end
    local major, minor = table.unpack(match)
    return {
        major = __TS__ParseInt(major),
        minor = __TS__ParseInt(minor)
    }
end
function ____exports.getReaperDataFile(self, filename)
    local parentDir = reaper.GetResourcePath()
    if filename then
        return path.normpath(path.join(parentDir, filename))
    else
        return path.normpath(parentDir)
    end
end
function ____exports.runMainAction(self, action, project)
    if type(action) == "string" then
        action = reaper.NamedCommandLookup(action)
    end
    reaper.Main_OnCommandEx(action, 0, project or 0)
end
function ____exports.runMidiAction(self, action, target)
    if type(action) == "string" then
        action = reaper.NamedCommandLookup(action)
    end
    if target ~= nil and target.hwnd ~= nil then
        reaper.MIDIEditor_OnCommand(target.hwnd, action)
    else
        reaper.MIDIEditor_LastFocused_OnCommand(action, target and target.listview or false)
    end
end
function ____exports.getActionContext(self)
    local is_new_value, filename, sectionID, cmdID, mode, resolution, val, contextstr = reaper.get_action_context()
    local ____temp_2
    if sectionID == -1 then
        ____temp_2 = nil
    else
        ____temp_2 = {sectionID = sectionID, cmdID = cmdID}
    end
    local action = ____temp_2
    return {filename = filename, action = action}
end
return ____exports
 end,
["lua_modules.reaper-api.path.path"] = function(...) 
--- A port of some functions from Python's os.path module

---@type string
local reaper_os = reaper.GetOS()
local is_windows = reaper_os:sub(1, 3) == "Win"

if is_windows then
  return require("lua_modules.reaper-api.path.ntpath")
else
  return require("lua_modules.reaper-api.path.posixpath")
end
 end,
["lua_modules.reaper-api.path.posixpath"] = function(...) 
-- port of os.path for Linux-based systems

local util = require("lua_modules.reaper-api.path.util")
local common = require("lua_modules.reaper-api.path.genericpath")

local getcwd = common.getcwd
local contains = util.contains

local module = {}

--- Split a pathname into drive and path. On Posix, drive is always empty.
--- @param path string
function module.splitdrive(path)
  return "", path
end

--[[
Join two or more pathname components, inserting '/' as needed.
If any component is an absolute path, all previous path components
will be discarded.  An empty last part will result in a path that
ends with a separator.
--]]
function module.join(a, ...)
  local p = { ... }
  local path = a
  for _, b in ipairs(p) do
    if b:sub(1, 1) == "/" then
      path = b
    elseif #path == 0 or path:sub(-1, -1) == "/" then
      path = path .. b
    else
      path = path .. "/" .. b
    end
  end
  return path
end

--- Split a path in root and extension.
--- The extension is everything starting at the last dot in the last
--- pathname component; the root is everything before that.
--- It is always true that root + ext == p.
function module.splitext(p)
  return common.splitext(p, "/", nil, ".")
end

-- Normalize a path, e.g. A//B, A/./B and A/foo/../B all become A/B.
-- It should be understood that this may change the meaning of the path
-- if it contains symbolic links!

--- Normalize path, eliminating double slashes, etc.
--- @param path string
function module.normpath(path)
  if #path == 0 then
    return "."
  end

  local initial_slashes = path:sub(1, 1) == "/"
  -- POSIX allows one or two initial slashes, but treats three or more as single slash.
  if initial_slashes and path:sub(2, 2) == "/" and not (path:sub(3, 3) == "/") then
    initial_slashes = 2
  end

  local comps = util.split(path, "[^/]*")
  local new_comps = {}
  for _, comp in ipairs(comps) do
    if contains(comp, { "", "." }) then
      goto continue
    end

    if
      comp ~= ".."
      or (not initial_slashes and #new_comps == 0)
      or (#new_comps > 0 and new_comps[#new_comps] == "..")
    then
      table.insert(new_comps, comp)
    elseif #new_comps > 0 then
      table.remove(new_comps)
    end
    ::continue::
  end
  comps = new_comps
  path = table.concat(comps, "/")
  if initial_slashes then
    if initial_slashes == true then
      initial_slashes = 1
    end

    path = ("/"):rep(initial_slashes) .. path
  end

  if #path > 0 then
    return path
  else
    return "."
  end
end

-- Split a path in head (everything up to the last '/') and tail (the
-- rest).  If the path ends in '/', tail will be empty.  If there is no
-- '/' in the path, head  will be empty.
-- Trailing '/'es are stripped from head unless it is the root.

--- Split a pathname.  Returns tuple "(head, tail)" where "tail" is
--- everything after the final slash.  Either part may be empty.
--- @param p string
function module.split(p)
  local sep_pos = ({ p:find(".*/") })[2] or 0
  local head, tail = p:sub(1, sep_pos), p:sub(sep_pos + 1)
  if #head > 0 and head ~= ("/"):rep(#head) then
    -- remove trailing slashes from head, unless it's all slashes
    -- https://stackoverflow.com/questions/17386792/how-to-implement-string-rfind-in-lua
    head = head:match("(.*[^/\\])") or head
  end
  return head, tail
end

-- Return whether a path is absolute.
-- Trivial in Posix, harder on the Mac or MS-DOS.

--- Test whether a path is absolute
function module.isabs(s)
  return s:sub(1, 1) == "/"
end

--- Return an absolute path.
--- @param path string
function module.abspath(path)
  if not module.isabs(path) then
    local cwd = getcwd()
    path = module.join(cwd, path)
  end
  return module.normpath(path)
end

--- Normalize case of pathname.  Has no effect under Posix
--- @param s string
function module.normcase(s)
  return s
end

--- Return a relative version of a path
--- @param path string
--- @param start string|nil
function module.relpath(path, start)
  if #path == 0 then
    return nil, "Given path is empty!"
  end

  if start == nil then
    start = "."
  end

  start = module.abspath(start)
  path = module.abspath(path)

  local start_list = {}
  for _, p in ipairs(util.split(start, "[^/]*")) do
    if #p > 0 then
      table.insert(start_list, p)
    end
  end

  local path_list = {}
  for _, p in ipairs(util.split(path, "[^/]*")) do
    if #p > 0 then
      table.insert(path_list, p)
    end
  end

  -- Work out how much of the filepath is shared by start and path.
  local i = 1
  for k = 1, math.min(#start_list, #path_list) do
    if start_list[k] ~= path_list[k] then
      break
    end
    i = k + 1
  end

  local rel_list = {}
  for j = 1, #start_list - i + 1 do
    rel_list[j] = ".."
  end
  local j = #rel_list + 1
  for k = i, #path_list do
    rel_list[j] = path_list[k]
    j = j + 1
  end

  if #rel_list == 0 then
    return "."
  end
  return module.join(table.unpack(rel_list))
end

return module
 end,
["lua_modules.reaper-api.path.genericpath"] = function(...) 
local module = {}

function module.splitext(p, sep, altsep, extsep)
	for i, x in ipairs({ sep, altsep, extsep }) do
		assert(#x == 1, "Input separator must be a single char")
	end

	local sepIndex = ({ p:find(".*%" .. sep) })[2] or 0

	if altsep ~= nil then
		local altsepIndex = ({ p:find(".*%" .. altsep) })[2] or 0
		sepIndex = math.max(sepIndex, altsepIndex)
	end

	local dotIndex = ({ p:find(".*%" .. extsep) })[2] or 0
	if dotIndex > sepIndex then
		-- skip all leading dots
		local filenameIndex = sepIndex + 1
		while filenameIndex < dotIndex do
			if p:sub(filenameIndex, filenameIndex) ~= extsep then
				return p:sub(1, dotIndex - 1), p:sub(dotIndex)
			end
			filenameIndex = filenameIndex + 1
		end
	end

	return p, ""
end

--- Get the current working directory
--- There is no native function to do this, you MUST use an external library for this
function module.getcwd()
	return reaper.GetExePath()
end

return module
 end,
["lua_modules.reaper-api.path.util"] = function(...) 
local module = {}

function module.contains(val, arr)
  for _, x in ipairs(arr) do
    if val == x then
      return true
    end
  end
  return false
end

-- http://lua-users.org/wiki/SplitJoin

-- local str = "a,,b"     -- comma-separated list
-- local pat = "[^,]*"    -- everything except commas
-- assert (table.concat(split(str, pat), ",") == str)

-- splits 'str' into pieces matching 'pat', returns them as an array
-- the following minimalistic splitting function now is a true inverse of table.concat
function module.split(str, pat)
  local tbl = {}
  str:gsub(pat, function(x)
    tbl[#tbl + 1] = x
  end)
  return tbl
end

return module
 end,
["lua_modules.reaper-api.path.ntpath"] = function(...) 
-- port of os.path for Windows

local util = require("lua_modules.reaper-api.path.util")
local common = require("lua_modules.reaper-api.path.genericpath")

local getcwd = common.getcwd
local contains = util.contains

local module = {}

function module.splitext(p)
  return common.splitext(p, "\\", "/", ".")
end

--- @param path string
function module.splitdrive(path)
  if #path >= 2 then
    -- normalized path, by replacing all forward slashes with backslashes
    local npath = path:gsub("/", "\\")
    if npath:sub(1, 2) == "\\\\" and npath:sub(3, 3) ~= "\\" then
      -- this is a UNC path (starts with 2 backslashes)

      -- |---drive letter---|
      -- \\machine\mountpoint\directory\etc\...
      --                     |---directory----|

      local first_sep = npath:find("\\", 3)
      if first_sep == nil then
        return "", path
      end

      -- a UNC path can't have 2 slashes in a row (other than the first two)
      local second_sep = npath:find("\\", first_sep + 1)
      if second_sep == first_sep + 1 then
        return "", path
      end

      if second_sep == nil then
        return path, ""
      else
        return path:sub(1, second_sep - 1), path:sub(second_sep)
      end
    end

    if path:sub(2, 2) == ":" then
      return path:sub(1, 2), path:sub(3)
    end
  end

  return "", path
end

function module.join(path, ...)
  local paths = { ... }

  local result_drive, result_path = module.splitdrive(path)

  -- iterate for 2nd path onwards
  for _, p in ipairs(paths) do
    local p_drive, p_path = module.splitdrive(p)
    if #p_path > 0 and contains(p_path:sub(1, 1), { "\\", "/" }) then
      -- second path is absolute
      if #p_drive > 0 or #result_drive == 0 then
        result_drive = p_drive
      end

      result_path = p_path
      goto continue
    elseif #p_drive > 0 and p_drive ~= result_drive then
      if p_drive:lower() ~= result_drive:lower() then
        -- Different drives => ignore the first path entirely
        result_drive = p_drive
        result_path = p_path
        goto continue
      end
      -- Same drive in different case
      result_drive = p_drive
    end
    -- Second path is relative to the first
    if #result_path > 0 and not contains(result_path:sub(-1, -1), { "\\", "/" }) then
      result_path = result_path .. "\\"
    end
    result_path = result_path .. p_path
    ::continue::
  end
  -- add separator between UNC and non-absolute path
  if
    #result_path > 0
    and not contains(result_path:sub(1, 1), { "\\", "/" })
    and #result_drive > 0
    and result_drive:sub(-1, -1) ~= ":"
  then
    return result_drive .. "\\" .. result_path
  end

  return result_drive .. result_path
end

-- Normalize a path, e.g. A//B, A/./B and A/foo/../B all become A\B.
-- Previously, this function also truncated pathnames to 8+3 format,
-- but as this module is called "ntpath", that's obviously wrong!

--- Normalize path, eliminating double slashes, etc.
function module.normpath(path)
  if contains(path:sub(1, 4), { [[\\.\]], [[\\?\]] }) then
    -- in the case of paths with these prefixes:
    -- \\.\ -> device names
    -- \\?\ -> literal paths
    -- do not do any normalization, but return the path
    -- unchanged apart from the call to os.fspath()
    return path
  end

  path = path:gsub("/", "\\")
  local prefix, path = module.splitdrive(path)

  -- collapse initial backslashes
  if path:sub(1, 1) == "\\" then
    prefix = prefix .. "\\"

    path = ({ path:gsub("^\\+", "") })[1]
  end

  -- split by separator into list
  local comps = util.split(path, "[^\\\\]*")
  local i = 1
  while i <= #comps do
    if #comps[i] == 0 or comps[i] == "." then
      table.remove(comps, i)
    elseif comps[i] == ".." then
      if i > 1 and comps[i - 1] ~= ".." then
        for _ = 0, 1 do -- do twice
          table.remove(comps, i - 1)
        end
        i = i - 1
      elseif i == 1 and prefix:sub(-1, -1) == "\\" then
        table.remove(comps, i)
      else
        i = i + 1
      end
    else
      i = i + 1
    end
  end
  -- If the path is now empty, substitute '.'
  if #prefix == 0 and #comps == 0 then
    comps[#comps + 1] = "."
  end
  return prefix .. table.concat(comps, "\\")
end

--- Split a pathname.
--- Return tuple (head, tail) where tail is everything after the final slash.
--- Either part may be empty.
--- @param p string
function module.split(p)
  local d, p = module.splitdrive(p)
  -- set i to index beyond p's last slash
  local i = #p + 1
  while i ~= 1 and not contains(p:sub(i - 1, i - 1), { "/", "\\" }) do
    i = i - 1
  end
  local head, tail = p:sub(1, i - 1), p:sub(i) -- now tail has no slashes
  -- remove trailing slashes from head, unless it's all slashes
  -- https://stackoverflow.com/questions/17386792/how-to-implement-string-rfind-in-lua
  head = head:match("(.*[^/\\])") or head
  return d .. head, tail
end

--- Test whether a path is absolute
--- @param path string
function module.isabs(path)
  -- Paths beginning with \\?\ are always absolute, but do not necessarily contain a drive.
  local ABS_PATTERN = [[\\?\]]
  if path:gsub("/", "\\"):sub(1, 4) == ABS_PATTERN then
    return true
  end

  _, path = module.splitdrive(path)
  return #path > 0 and contains(path:sub(1, 1), { "/", "\\" })
end

--- Return an absolute path.
--- @param path string
function module.abspath(path)
  if not module.isabs(path) then
    local cwd = getcwd()
    path = module.join(cwd, path)
  end
  return module.normpath(path)
end

--- Normalize case of pathname.
--- Makes all characters lowercase and all slashes into backslashes.
--- @param s string
function module.normcase(s)
  return s:gsub("/", "\\"):lower()
end

--- Return a relative version of a path
function module.relpath(path, start)
  if #path == 0 then
    return nil, "Given path is empty!"
  end

  if start == nil then
    start = "."
  end

  local start_abs = module.abspath(module.normpath(start))
  local path_abs = module.abspath(module.normpath(path))
  local start_drive, start_rest = module.splitdrive(start_abs)
  local path_drive, path_rest = module.splitdrive(path_abs)
  if module.normcase(start_drive) ~= module.normcase(path_drive) then
    return nil, ("path is on mount %r, start on mount %r"):format(path_drive, start_drive)
  end

  local start_list = {}
  for _, p in ipairs(util.split(start_rest, "[^\\]*")) do
    if #p > 0 then
      table.insert(start_list, p)
    end
  end

  local path_list = {}
  for _, p in ipairs(util.split(path_rest, "[^\\]*")) do
    if #p > 0 then
      table.insert(path_list, p)
    end
  end

  -- Work out how much of the filepath is shared by start and path.
  local i = 1
  for k = 1, math.min(#start_list, #path_list) do
    if module.normcase(start_list[k]) ~= module.normcase(path_list[k]) then
      break
    end
    i = k + 1
  end

  local rel_list = {}
  for j = 1, #start_list - i + 1 do
    rel_list[j] = ".."
  end
  local j = #rel_list + 1
  for k = i, #path_list do
    rel_list[j] = path_list[k]
    j = j + 1
  end

  if #rel_list == 0 then
    return "."
  end
  return module.join(table.unpack(rel_list))
end

return module
 end,
["lua_modules.reaper-api.inspect"] = function(...) 
local _tl_compat; if (tonumber((_VERSION or ''):match('[%d.]*$')) or 0) < 5.3 then local p, m = pcall(require, 'compat53.module'); if p then _tl_compat = m end end; local math = _tl_compat and _tl_compat.math or math; local string = _tl_compat and _tl_compat.string or string; local table = _tl_compat and _tl_compat.table or table
local inspect = {Options = {}, }

















inspect._VERSION = 'inspect.lua 3.1.0'
inspect._URL = 'http://github.com/kikito/inspect.lua'
inspect._DESCRIPTION = 'human-readable representations of tables'
inspect._LICENSE = [[
  MIT LICENSE

  Copyright (c) 2022 Enrique García Cota

  Permission is hereby granted, free of charge, to any person obtaining a
  copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:

  The above copyright notice and this permission notice shall be included
  in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
]]
inspect.KEY = setmetatable({}, { __tostring = function() return 'inspect.KEY' end })
inspect.METATABLE = setmetatable({}, { __tostring = function() return 'inspect.METATABLE' end })

local tostring = tostring
local rep = string.rep
local match = string.match
local char = string.char
local gsub = string.gsub
local fmt = string.format

local _rawget
if rawget then
   _rawget = rawget
else
   _rawget = function(t, k) return t[k] end
end

local function rawpairs(t)
   return next, t, nil
end



local function smartQuote(str)
   if match(str, '"') and not match(str, "'") then
      return "'" .. str .. "'"
   end
   return '"' .. gsub(str, '"', '\\"') .. '"'
end


local shortControlCharEscapes = {
   ["\a"] = "\\a", ["\b"] = "\\b", ["\f"] = "\\f", ["\n"] = "\\n",
   ["\r"] = "\\r", ["\t"] = "\\t", ["\v"] = "\\v", ["\127"] = "\\127",
}
local longControlCharEscapes = { ["\127"] = "\127" }
for i = 0, 31 do
   local ch = char(i)
   if not shortControlCharEscapes[ch] then
      shortControlCharEscapes[ch] = "\\" .. i
      longControlCharEscapes[ch] = fmt("\\%03d", i)
   end
end

local function escape(str)
   return (gsub(gsub(gsub(str, "\\", "\\\\"),
   "(%c)%f[0-9]", longControlCharEscapes),
   "%c", shortControlCharEscapes))
end

local luaKeywords = {
   ['and'] = true,
   ['break'] = true,
   ['do'] = true,
   ['else'] = true,
   ['elseif'] = true,
   ['end'] = true,
   ['false'] = true,
   ['for'] = true,
   ['function'] = true,
   ['goto'] = true,
   ['if'] = true,
   ['in'] = true,
   ['local'] = true,
   ['nil'] = true,
   ['not'] = true,
   ['or'] = true,
   ['repeat'] = true,
   ['return'] = true,
   ['then'] = true,
   ['true'] = true,
   ['until'] = true,
   ['while'] = true,
}

local function isIdentifier(str)
   return type(str) == "string" and
   not not str:match("^[_%a][_%a%d]*$") and
   not luaKeywords[str]
end

local flr = math.floor
local function isSequenceKey(k, sequenceLength)
   return type(k) == "number" and
   flr(k) == k and
   1 <= (k) and
   k <= sequenceLength
end

local defaultTypeOrders = {
   ['number'] = 1, ['boolean'] = 2, ['string'] = 3, ['table'] = 4,
   ['function'] = 5, ['userdata'] = 6, ['thread'] = 7,
}

local function sortKeys(a, b)
   local ta, tb = type(a), type(b)


   if ta == tb and (ta == 'string' or ta == 'number') then
      return (a) < (b)
   end

   local dta = defaultTypeOrders[ta] or 100
   local dtb = defaultTypeOrders[tb] or 100


   return dta == dtb and ta < tb or dta < dtb
end

local function getKeys(t)

   local seqLen = 1
   while _rawget(t, seqLen) ~= nil do
      seqLen = seqLen + 1
   end
   seqLen = seqLen - 1

   local keys, keysLen = {}, 0
   for k in rawpairs(t) do
      if not isSequenceKey(k, seqLen) then
         keysLen = keysLen + 1
         keys[keysLen] = k
      end
   end
   table.sort(keys, sortKeys)
   return keys, keysLen, seqLen
end

local function countCycles(x, cycles)
   if type(x) == "table" then
      if cycles[x] then
         cycles[x] = cycles[x] + 1
      else
         cycles[x] = 1
         for k, v in rawpairs(x) do
            countCycles(k, cycles)
            countCycles(v, cycles)
         end
         countCycles(getmetatable(x), cycles)
      end
   end
end

local function makePath(path, a, b)
   local newPath = {}
   local len = #path
   for i = 1, len do newPath[i] = path[i] end

   newPath[len + 1] = a
   newPath[len + 2] = b

   return newPath
end


local function processRecursive(process,
   item,
   path,
   visited)
   if item == nil then return nil end
   if visited[item] then return visited[item] end

   local processed = process(item, path)
   if type(processed) == "table" then
      local processedCopy = {}
      visited[item] = processedCopy
      local processedKey

      for k, v in rawpairs(processed) do
         processedKey = processRecursive(process, k, makePath(path, k, inspect.KEY), visited)
         if processedKey ~= nil then
            processedCopy[processedKey] = processRecursive(process, v, makePath(path, processedKey), visited)
         end
      end

      local mt = processRecursive(process, getmetatable(processed), makePath(path, inspect.METATABLE), visited)
      if type(mt) ~= 'table' then mt = nil end
      setmetatable(processedCopy, mt)
      processed = processedCopy
   end
   return processed
end

local function puts(buf, str)
   buf.n = buf.n + 1
   buf[buf.n] = str
end



local Inspector = {}










local Inspector_mt = { __index = Inspector }

local function tabify(inspector)
   puts(inspector.buf, inspector.newline .. rep(inspector.indent, inspector.level))
end

function Inspector:getId(v)
   local id = self.ids[v]
   local ids = self.ids
   if not id then
      local tv = type(v)
      id = (ids[tv] or 0) + 1
      ids[v], ids[tv] = id, id
   end
   return tostring(id)
end

function Inspector:putValue(v)
   local buf = self.buf
   local tv = type(v)
   if tv == 'string' then
      puts(buf, smartQuote(escape(v)))
   elseif tv == 'number' or tv == 'boolean' or tv == 'nil' or
      tv == 'cdata' or tv == 'ctype' then
      puts(buf, tostring(v))
   elseif tv == 'table' and not self.ids[v] then
      local t = v

      if t == inspect.KEY or t == inspect.METATABLE then
         puts(buf, tostring(t))
      elseif self.level >= self.depth then
         puts(buf, '{...}')
      else
         if self.cycles[t] > 1 then puts(buf, fmt('<%d>', self:getId(t))) end

         local keys, keysLen, seqLen = getKeys(t)

         puts(buf, '{')
         self.level = self.level + 1

         for i = 1, seqLen + keysLen do
            if i > 1 then puts(buf, ',') end
            if i <= seqLen then
               puts(buf, ' ')
               self:putValue(t[i])
            else
               local k = keys[i - seqLen]
               tabify(self)
               if isIdentifier(k) then
                  puts(buf, k)
               else
                  puts(buf, "[")
                  self:putValue(k)
                  puts(buf, "]")
               end
               puts(buf, ' = ')
               self:putValue(t[k])
            end
         end

         local mt = getmetatable(t)
         if type(mt) == 'table' then
            if seqLen + keysLen > 0 then puts(buf, ',') end
            tabify(self)
            puts(buf, '<metatable> = ')
            self:putValue(mt)
         end

         self.level = self.level - 1

         if keysLen > 0 or type(mt) == 'table' then
            tabify(self)
         elseif seqLen > 0 then
            puts(buf, ' ')
         end

         puts(buf, '}')
      end

   else
      puts(buf, fmt('<%s %d>', tv, self:getId(v)))
   end
end




function inspect.inspect(root, options)
   options = options or {}

   local depth = options.depth or (math.huge)
   local newline = options.newline or '\n'
   local indent = options.indent or '  '
   local process = options.process

   if process then
      root = processRecursive(process, root, {}, {})
   end

   local cycles = {}
   countCycles(root, cycles)

   local inspector = setmetatable({
      buf = { n = 0 },
      ids = {},
      cycles = cycles,
      depth = depth,
      level = 0,
      newline = newline,
      indent = indent,
   }, Inspector_mt)

   inspector:putValue(root)

   return table.concat(inspector.buf)
end

setmetatable(inspect, {
   __call = function(_, root, options)
      return inspect.inspect(root, options)
   end,
})

return inspect
 end,
["lua_modules.reaper-api.extstate"] = function(...) 
--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
--- Set a ext state. Defaults to permanent.
-- 
-- WARNING: An empty string is the same as setting as null!
function ____exports.set(self, section, key, value, permanent)
    if permanent == nil then
        permanent = true
    end
    if value == nil or #value == 0 then
        reaper.DeleteExtState(section, key, permanent)
    else
        reaper.SetExtState(section, key, value, permanent)
    end
end
--- This returns a string or null.
-- 
-- Conditions for returning null:
-- - key is not set
-- - key is set to an empty string (length 0)
function ____exports.get(self, section, key)
    local rv = reaper.GetExtState(section, key)
    if #rv == 0 then
        return nil
    end
    return rv
end
--- Check if the key is set, even if the value is an empty string `""`.
-- 
-- @deprecated The other functions `set` and `get` treat `""` the same
-- as 'key not set', so this function is an outlier.
function ____exports.has(self, section, key)
    return reaper.HasExtState(section, key)
end
--- Wrapper around a section for easier usage.
function ____exports.Section(self, section)
    return {
        set = function(self, key, value, permanent)
            ____exports.set(
                nil,
                section,
                key,
                value,
                permanent
            )
        end,
        get = function(self, key)
            return ____exports.get(nil, section, key)
        end
    }
end
return ____exports
 end,
["lua_modules.reaper-api.clipboard"] = function(...) 
--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____utils = require("lua_modules.reaper-api.utils")
local ensureAPI = ____utils.ensureAPI
local apiChecked = false
local function checkAPI(self)
    if apiChecked then
        return
    end
    ensureAPI(nil, "SWS Extensions", "CF_SetClipboard")
    ensureAPI(nil, "SWS Extensions", "CF_GetClipboard")
    apiChecked = true
end
function ____exports.copy(self, text)
    checkAPI(nil)
    reaper.CF_SetClipboard(text)
end
function ____exports.paste(self)
    checkAPI(nil)
    return reaper.CF_GetClipboard()
end
return ____exports
 end,
["lua_modules.json.index"] = function(...) 
--
-- json.lua
--
-- Copyright (c) 2020 rxi
--
-- Permission is hereby granted, free of charge, to any person obtaining a copy of
-- this software and associated documentation files (the "Software"), to deal in
-- the Software without restriction, including without limitation the rights to
-- use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
-- of the Software, and to permit persons to whom the Software is furnished to do
-- so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in all
-- copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE.
--

local json = { _version = "0.1.2" }

-------------------------------------------------------------------------------
-- Encode
-------------------------------------------------------------------------------

local encode

local escape_char_map = {
	["\\"] = "\\",
	['"'] = '"',
	["\b"] = "b",
	["\f"] = "f",
	["\n"] = "n",
	["\r"] = "r",
	["\t"] = "t",
}

local escape_char_map_inv = { ["/"] = "/" }
for k, v in pairs(escape_char_map) do
	escape_char_map_inv[v] = k
end

local function escape_char(c)
	return "\\" .. (escape_char_map[c] or string.format("u%04x", c:byte()))
end

local function encode_nil(val)
	return "null"
end

local function encode_table(val, stack)
	local res = {}
	stack = stack or {}

	-- Circular reference?
	if stack[val] then
		error("circular reference")
	end

	stack[val] = true

	if rawget(val, 1) ~= nil or next(val) == nil then
		-- Treat as array -- check keys are valid and it is not sparse
		local n = 0
		for k in pairs(val) do
			if type(k) ~= "number" then
				error("invalid table: mixed or invalid key types")
			end
			n = n + 1
		end
		if n ~= #val then
			error("invalid table: sparse array")
		end
		-- Encode
		for i, v in ipairs(val) do
			table.insert(res, encode(v, stack))
		end
		stack[val] = nil
		return "[" .. table.concat(res, ",") .. "]"
	else
		-- Treat as an object
		for k, v in pairs(val) do
			if type(k) ~= "string" then
				error("invalid table: mixed or invalid key types")
			end
			table.insert(res, encode(k, stack) .. ":" .. encode(v, stack))
		end
		stack[val] = nil
		return "{" .. table.concat(res, ",") .. "}"
	end
end

local function encode_string(val)
	return '"' .. val:gsub('[%z\1-\31\\"]', escape_char) .. '"'
end

local function encode_number(val)
	-- Check for NaN, -inf and inf
	if val ~= val or val <= -math.huge or val >= math.huge then
		error("unexpected number value '" .. tostring(val) .. "'")
	end
	return string.format("%.14g", val)
end

local type_func_map = {
	["nil"] = encode_nil,
	["table"] = encode_table,
	["string"] = encode_string,
	["number"] = encode_number,
	["boolean"] = tostring,
}

encode = function(val, stack)
	local t = type(val)
	local f = type_func_map[t]
	if f then
		return f(val, stack)
	end
	error("unexpected type '" .. t .. "'")
end

function json.encode(val)
	return (encode(val))
end

-------------------------------------------------------------------------------
-- Decode
-------------------------------------------------------------------------------

local parse

local function create_set(...)
	local res = {}
	for i = 1, select("#", ...) do
		res[select(i, ...)] = true
	end
	return res
end

local space_chars = create_set(" ", "\t", "\r", "\n")
local delim_chars = create_set(" ", "\t", "\r", "\n", "]", "}", ",")
local escape_chars = create_set("\\", "/", '"', "b", "f", "n", "r", "t", "u")
local literals = create_set("true", "false", "null")

local literal_map = {
	["true"] = true,
	["false"] = false,
	["null"] = nil,
}

local function next_char(str, idx, set, negate)
	for i = idx, #str do
		if set[str:sub(i, i)] ~= negate then
			return i
		end
	end
	return #str + 1
end

local function decode_error(str, idx, msg)
	local line_count = 1
	local col_count = 1
	for i = 1, idx - 1 do
		col_count = col_count + 1
		if str:sub(i, i) == "\n" then
			line_count = line_count + 1
			col_count = 1
		end
	end
	error(string.format("%s at line %d col %d", msg, line_count, col_count))
end

local function codepoint_to_utf8(n)
	-- http://scripts.sil.org/cms/scripts/page.php?site_id=nrsi&id=iws-appendixa
	local f = math.floor
	if n <= 0x7f then
		return string.char(n)
	elseif n <= 0x7ff then
		return string.char(f(n / 64) + 192, n % 64 + 128)
	elseif n <= 0xffff then
		return string.char(f(n / 4096) + 224, f(n % 4096 / 64) + 128, n % 64 + 128)
	elseif n <= 0x10ffff then
		return string.char(f(n / 262144) + 240, f(n % 262144 / 4096) + 128, f(n % 4096 / 64) + 128, n % 64 + 128)
	end
	error(string.format("invalid unicode codepoint '%x'", n))
end

local function parse_unicode_escape(s)
	local n1 = tonumber(s:sub(1, 4), 16)
	local n2 = tonumber(s:sub(7, 10), 16)
	-- Surrogate pair?
	if n2 then
		return codepoint_to_utf8((n1 - 0xd800) * 0x400 + (n2 - 0xdc00) + 0x10000)
	else
		return codepoint_to_utf8(n1)
	end
end

local function parse_string(str, i)
	local res = ""
	local j = i + 1
	local k = j

	while j <= #str do
		local x = str:byte(j)

		if x < 32 then
			decode_error(str, j, "control character in string")
		elseif x == 92 then -- `\`: Escape
			res = res .. str:sub(k, j - 1)
			j = j + 1
			local c = str:sub(j, j)
			if c == "u" then
				local hex = str:match("^[dD][89aAbB]%x%x\\u%x%x%x%x", j + 1)
					or str:match("^%x%x%x%x", j + 1)
					or decode_error(str, j - 1, "invalid unicode escape in string")
				res = res .. parse_unicode_escape(hex)
				j = j + #hex
			else
				if not escape_chars[c] then
					decode_error(str, j - 1, "invalid escape char '" .. c .. "' in string")
				end
				res = res .. escape_char_map_inv[c]
			end
			k = j + 1
		elseif x == 34 then -- `"`: End of string
			res = res .. str:sub(k, j - 1)
			return res, j + 1
		end

		j = j + 1
	end

	decode_error(str, i, "expected closing quote for string")
end

local function parse_number(str, i)
	local x = next_char(str, i, delim_chars)
	local s = str:sub(i, x - 1)
	local n = tonumber(s)
	if not n then
		decode_error(str, i, "invalid number '" .. s .. "'")
	end
	return n, x
end

local function parse_literal(str, i)
	local x = next_char(str, i, delim_chars)
	local word = str:sub(i, x - 1)
	if not literals[word] then
		decode_error(str, i, "invalid literal '" .. word .. "'")
	end
	return literal_map[word], x
end

local function parse_array(str, i)
	local res = {}
	local n = 1
	i = i + 1
	while 1 do
		local x
		i = next_char(str, i, space_chars, true)
		-- Empty / end of array?
		if str:sub(i, i) == "]" then
			i = i + 1
			break
		end
		-- Read token
		x, i = parse(str, i)
		res[n] = x
		n = n + 1
		-- Next token
		i = next_char(str, i, space_chars, true)
		local chr = str:sub(i, i)
		i = i + 1
		if chr == "]" then
			break
		end
		if chr ~= "," then
			decode_error(str, i, "expected ']' or ','")
		end
	end
	return res, i
end

local function parse_object(str, i)
	local res = {}
	i = i + 1
	while 1 do
		local key, val
		i = next_char(str, i, space_chars, true)
		-- Empty / end of object?
		if str:sub(i, i) == "}" then
			i = i + 1
			break
		end
		-- Read key
		if str:sub(i, i) ~= '"' then
			decode_error(str, i, "expected string for key")
		end
		key, i = parse(str, i)
		-- Read ':' delimiter
		i = next_char(str, i, space_chars, true)
		if str:sub(i, i) ~= ":" then
			decode_error(str, i, "expected ':' after key")
		end
		i = next_char(str, i + 1, space_chars, true)
		-- Read value
		val, i = parse(str, i)
		-- Set
		res[key] = val
		-- Next token
		i = next_char(str, i, space_chars, true)
		local chr = str:sub(i, i)
		i = i + 1
		if chr == "}" then
			break
		end
		if chr ~= "," then
			decode_error(str, i, "expected '}' or ','")
		end
	end
	return res, i
end

local char_func_map = {
	['"'] = parse_string,
	["0"] = parse_number,
	["1"] = parse_number,
	["2"] = parse_number,
	["3"] = parse_number,
	["4"] = parse_number,
	["5"] = parse_number,
	["6"] = parse_number,
	["7"] = parse_number,
	["8"] = parse_number,
	["9"] = parse_number,
	["-"] = parse_number,
	["t"] = parse_literal,
	["f"] = parse_literal,
	["n"] = parse_literal,
	["["] = parse_array,
	["{"] = parse_object,
}

parse = function(str, idx)
	local chr = str:sub(idx, idx)
	local f = char_func_map[chr]
	if f then
		return f(str, idx)
	end
	decode_error(str, idx, "unexpected character '" .. chr .. "'")
end

function json.decode(str)
	if type(str) ~= "string" then
		error("expected argument of type string, got " .. type(str))
	end
	local res, idx = parse(str, next_char(str, 1, space_chars, true))
	idx = next_char(str, idx, space_chars, true)
	if idx <= #str then
		decode_error(str, idx, "trailing garbage")
	end
	return res
end

return json
 end,
}
return require("index", ...)
