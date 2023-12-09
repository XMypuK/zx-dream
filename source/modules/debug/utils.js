function DebugUtils() {
    
}
DebugUtils.orderedInsert = function (array, element, keyFn, cmpFn) {
    if (typeof keyFn === 'undefined') {
        keyFn = function (e) { return e; };
    }
    var index = DebugUtils.orderedSearch(array, keyFn(element), keyFn, cmpFn);
    if (index >= 0)
        throw new Error('The given key is already presented in the array.');
    var insertIndex = -1 - index;
    array.splice(insertIndex, 0, element);
    return insertIndex;
}
DebugUtils.orderedSearch = function (array, key, keyFn, cmpFn) {
    if (typeof keyFn === 'undefined') {
        keyFn = function (e) { return e; };
    }
    if (typeof cmpFn === 'undefined') {
        cmpFn = function (key1, key2) { return key1 - key2; };
    }
    var begin = 0;
    var end = array.length;
    while (begin < end) {
        var i = (begin + (end - begin) / 2) | 0;
        var element = array[i];
        var elementKey = keyFn(element);
        var res = cmpFn(elementKey, key);
        if (!res) return i;
        if (res < 0) begin = i + 1;
        else end = i;
    }
    return -1 - begin;
}
DebugUtils.wordToString = function (value) {
    return ('0000' + (value || 0).toString(16)).substr(-4).toUpperCase();
};
DebugUtils.byteToString = function (value) {
    return ('00' + (value || 0).toString(16)).substr(-2).toUpperCase();
};
DebugUtils.bytesToString = function (arr) {
    var s = '';
    for ( var i = 0; i < arr.length; i++ ) {
        s += DebugUtils.byteToString(arr[i]);
    }
    return s;
};
DebugUtils.evaluateToken = function (token, bus, state) {
    switch ((token || '').toUpperCase()) {
        case 'PC': return state.pc;
        case 'SP': return state.sp;
        case 'IX': return state.ix;
        case 'IY': return state.iy;
        case 'HL': return state.hl;
        case 'DE': return state.de;
        case 'BC': return state.bc;
        case 'AF': return state.af;
        case 'HL\'': return state.hl_;
        case 'DE\'': return state.de_;
        case 'BC\'': return state.bc_;
        case 'AF\'': return state.af_;
    }
    var m = /^[0-9A-F]+$/i.exec(token);
    if (!m)
        throw new Error('Unable to evaluate "' + token + '"');
    return parseInt(m[0], 16);
};
DebugUtils.evaluateExpression = function (formula, bus, state, evaluationState) {
    var es = evaluationState || { 
        expression: (formula || '').replace(/\s+/g, ''),
        index: 0,
        plus: false,
        minus: false,
        token: '',
        sum: 0,
        subExpressionEnd: false,
        topLevel: true
    };

    while (!es.subExpressionEnd && es.index < es.expression.length) {
        var c = es.expression.charAt(es.index);
        switch (c) {
            case '-':
            case '+':
                if (es.token !== '') {
                    var subValue = DebugUtils.evaluateToken(es.token, bus, state);
                    if (es.minus) subValue = -subValue;
                    es.sum += subValue;
                    es.token = '';
                    es.plus = false;
                    es.minus = false;
                }
                else {
                    if (es.minus || es.plus)
                        throw new Error('Unexpected "' + c + '" at position ' + es.index + '.');
                }
                switch (c) {
                    case '-': es.minus = true; break;
                    case '+': es.plus = true; break;
                }
                es.index++;
                break;

            case '(':
                if (es.token !== '') 
                    throw new Error('Unexpected "(" at position ' + es.index + '.');
                var subEs = {
                    expression: es.expression,
                    index: es.index + 1,
                    plus: false,
                    minus: false,
                    token: '',
                    sum: 0,
                    subExpressionEnd: false
                };
                var subValue = DebugUtils.evaluateExpression(es.expression, bus, state, subEs);
                if (subEs.index >= es.expression.length)
                    throw new Error('Unexpected end of expression. Expecting ")".');
                var c2 = es.expression.charAt(subEs.index);
                if (c2 !== ')')
                    throw new Error('Unexpected "' + c2 + '" at position ' + subEs.index + '. Expecting ")".');
                if (isNaN(subValue)) 
                    throw new Error('Could not evaluate subexpression at position ' + (es.index + 1) + '.');
                var subResult = bus.mem_read(subValue & 0xFFFF) | (bus.mem_read((subValue + 1) & 0xFFFF) << 8);
                if (es.minus) {
                    subResult = -subResult;
                }
                es.sum += subResult;
                es.index = subEs.index + 1;
                es.token = '';
                es.minus = false;
                es.plus = false;
                break;

            case ')':
                es.subExpressionEnd = true;
                break;

            default:
                es.token += c;
                es.index++;
                break;
        }
    }
    if (es.topLevel && es.index < es.expression.length)
        throw new Error('Unexpected "' + es.expression.charAt(es.index) + '" at position ' + es.index + '.');
    
    if (es.token !== '') {
        var subValue = DebugUtils.evaluateToken(es.token, bus, state);
        if (es.minus) subValue = -subValue;
        es.sum += subValue;
    }
    return es.sum;
};