const DYNAMIC_PRECS = {
  call: 1,
};

const PRECS = {
  type: 7,
  multiplication: 11,
  addition: 10,
  infix_operations: 9,
  nil_coalescing: 8,
  check: 7,
  prefix_operations: 7,
  comparison: 6,
  postfix_operations: 6,
  equality: 5,
  conjunction: 4,
  disjunction: 3,
  block: 2,
  assignment: -3,
  loop: 1,
  keypath: 1,
  parameter_pack: 1,
  control_transfer: -4,
  as: -1,
  tuple: -1,
  if: -1,
  switch: -1,
  do: -1,
  fully_open_range: -1,
  range: -1,
  navigation: -1,
  expr: -1,
  call: -2,
  ternary: -2,
  try: -2,
  call_suffix: -2,
  range_suffix: -2,
  ternary_binary_suffix: -2,
  await: -2,
  assignment: -3,
  comment: -3,
  lambda: -3,
  regex: -4,
};
const ESCAPE_SEQUENCE = token.immediate(seq(
  '\\',
  choice(
    /[^xu]/,
    /u[0-9a-fA-F]{4}/,
    /u\{[0-9a-fA-F]+\}/
  )
));

const DEC_DIGITS = sep1(/_+/, /[0-9]+/);
const HEX_DIGITS = sep1(/_+/, /[0-9a-fA-F]+/);
const OCT_DIGITS = sep1(/_+/, /[0-7]+/);
const BIN_DIGITS = sep1(/_+/, /[01]+/);
const REAL_EXPONENT = seq(/[eE]/, optional(/[+-]/), DEC_DIGITS);
const HEX_REAL_EXPONENT = seq(/[pP]/, optional(/[+-]/), DEC_DIGITS);

var LEXICAL_IDENTIFIER;

if (tree_sitter_version_supports_emoji()) {
  LEXICAL_IDENTIFIER =
    /[_\p{XID_Start}\p{Emoji}&&[^0-9#*]](\p{EMod}|\x{FE0F}\x{20E3}?)?([_\p{XID_Continue}\p{Emoji}\x{200D}](\p{EMod}|\x{FE0F}\x{20E3}?)?)*/;
} else {
  LEXICAL_IDENTIFIER = /[_\p{XID_Start}][_\p{XID_Continue}]*/;
}


function tree_sitter_version_supports_emoji() {
  try {
    return (
      TREE_SITTER_CLI_VERSION_MAJOR > 0 ||
      TREE_SITTER_CLI_VERSION_MINOR > 20 ||
      TREE_SITTER_CLI_VERSION_PATCH >= 5
    );
  } catch (err) {
    if (err instanceof ReferenceError) {
      return false;
    } else {
      throw err;
    }
  }
}
function sep(sep, rule) {
  return optional(sep1(sep, rule));
}

function sep1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}

module.exports = grammar({
  name: 'cangjie',

  extras: $ => [
    /\s/,
    $.multiline_comment,
    $.line_comment,
  ],
  externals: ($) => [
    // Comments and raw strings are parsed in a custom scanner because they require us to carry forward state to
    // maintain symmetry. For instance, parsing a multiline comment requires us to increment a counter whenever we see
    // `/*`, and decrement it whenever we see `*/`. A standard grammar would only be able to exit the comment at the
    // first `*/` (like C does). Similarly, when you start a string with `##"`, you're required to include the same
    // number of `#` symbols to end it.
    $.multiline_comment,
    $.raw_str_part,
    $.raw_str_continuing_indicator,
    $.raw_str_end_part,

    $._implicit_semi,
    $._explicit_semi,
    // Every one of the below operators will suppress a `_semi` if we encounter it after a newline.
    $._arrow_operator_custom,
    $._dot_custom,
    $._conjunction_operator_custom,
    $._disjunction_operator_custom,
    $._nil_coalescing_operator_custom,
    $._eq_custom,
    $._eq_eq_custom,
    $._plus_then_ws,
    $._minus_then_ws,
    $._bang_custom,
    $._throws_keyword,
    $._rethrows_keyword,
    $.default_keyword,
    $.where_keyword,
    $["else"],
    $.else_keyword,
    $.catch_keyword,
    $._as_custom,
    $._as_quest_custom,
    $._as_bang_custom,
    $._async_keyword_custom,
    $._custom_operator,
    $._hash_symbol_custom,
    $._directive_if,
    $._directive_elseif,
    $._directive_else,
    $._directive_endif,

    $._fake_try_bang,
  ],


  supertypes: $ => [
    $._expression,
    $._declaration,
    $._pattern,
    $._type,
    $._atomic_expression,
  ],

  conflicts: $ => [
    [$._atomic_expression, $._type],
    [$.postfix_expression, $.expr_hack_at_ternary_binary_call_suffix],
  ],

  rules: {
    source_file: $ => repeat($._statement),


    _statement: $ => choice(
      $._declaration,
      $._expression_statement,
    ),

    line_comment: $ => token(seq(
      '//',
      /[^\n]*/
    )),

    _declaration: $ => choice(
      $.variable_declaration,
      $.function_declaration,
      $.enum_declaration,
    ),


    _atomic_expression: $ => choice(
      $.parenthesized_expression,
      $.tuple_expression,
      $.unit_expression,
      $._basic_literal,
      $.array_literal,
      $.identifier,
    ),

    _expression: $ => choice(
      $._atomic_expression,
      // $.generic_expression,
      $.unary_expression,
      $.binary_expression,
      $.postfix_expression,
      $.assignment_expression,
      $.control_transfer_statement,
      $.if_expression,
      $.while_expression,
    ),


    assignment_expression: $ => prec.right(PRECS.assignment, seq(
      field('left', choice($.identifier, $.postfix_expression)), // 左值只能是变量或成员访问
      '=',
      field('right', $._expression)
    )),

    _type_identifier: $ => alias($.scoped_type_identifier, $.type_identifier),

    scoped_type_identifier: $ => prec.left(1, seq(
      field('path', choice($.identifier, $.scoped_type_identifier)),
      '.',
      field('name', $.identifier)
    )),


    control_transfer_statement: ($) =>
      choice(
        // prec.right(PRECS.control_transfer, $._throw_statement),
        prec.right(
          PRECS.control_transfer,
          seq(
            $._optionally_valueful_control_keyword,
            field("result", optional($._expression))
          )
        )
      ),

    _optionally_valueful_control_keyword: ($) =>
      choice("return", "continue", "break", "yield"),

    // --- 控制流表达式 (Control Flow) ---

    // if 表达式 (规约 4.3)
    // TODO: if-let 
    if_expression: ($) =>
      prec.right(
        PRECS["if"],
        seq(
          "if",
          field("condition", $.parenthesized_expression),
          field("body", $.block),
          optional(seq($["else"], $._else_options))
        )
      ),

    _else_options: ($) => choice(
      field("body", $.block),
      $.if_expression),

    guard_statement: ($) =>
      prec.right(
        PRECS["if"],
        seq(
          "guard",
          field("condition", $.parenthesized_expression),
          $["else"],
          $.block
        )
      ),

    // while 表达式 (规约 4.5.2)
    while_expression: $ => prec(PRECS.loop, seq(
      'while',
      field('condition', $.parenthesized_expression),
      field('body', $.block)
    )),

    _if_condition_sequence_item: ($) =>
      $._expression,


    _equal_sign: ($) => alias($._eq_custom, "="),
    _eq_eq: ($) => alias($._eq_eq_custom, "=="),
    _dot: ($) => alias($._dot_custom, "."),
    _arrow_operator: ($) => alias($._arrow_operator_custom, "->"),
    _conjunction_operator: ($) => alias($._conjunction_operator_custom, "&&"),
    _disjunction_operator: ($) => alias($._disjunction_operator_custom, "||"),
    _nil_coalescing_operator: ($) =>
      alias($._nil_coalescing_operator_custom, "??"),
    _as: ($) => alias($._as_custom, "as"),
    _as_quest: ($) => alias($._as_quest_custom, "as?"),
    _as_bang: ($) => alias($._as_bang_custom, "as!"),
    _hash_symbol: ($) => alias($._hash_symbol_custom, "as!"),
    bang: ($) => choice($._bang_custom, "!"),
    _async_keyword: ($) => alias($._async_keyword_custom, "async"),
    throws: ($) => choice($._throws_keyword, $._rethrows_keyword),

    // --- Enum (from 2.1.10) ---
    enum_body: $ => seq(
      '{',
      optional('|'),
      optional($._enum_case_list),
      repeat($._declaration),
      '}'
    ),

    _enum_case_list: $ => seq(
      $.enum_case,
      repeat(seq('|', $.enum_case))
    ),

    enum_declaration: $ => seq(
      optional('public'),
      'enum',
      field('name', $.identifier),
      optional(field('generic_parameters', $.generic_parameter_clause)),
      optional(field('inheritance', $.type_inheritance_clause)),
      field('body', $.enum_body)
    ),

    enum_case: $ => seq(
      field('name', $.identifier),
      optional(field('parameters', $.enum_case_parameters))
    ),

    enum_case_parameters: $ => alias($.parameter_types, $.enum_case_parameter_list),

    type_argument_clause: $ => prec(1, seq(
      '<',
      sep1(
        ',',
        choice(
          // array<T,U>
          $._type,
          // varray<T,$N>
          $.varray_size_specifier
        ),
      ),
      '>'
    )),

    tuple_type: $ => prec(PRECS.tuple, seq(
      '(',
      sep1(',', $._type),
      ')'
    )),

    type_inheritance_clause: $ => seq(
      '<:',
      sep1('&', $._type)
    ),


    // generic part 
    _generic_argument: $ => choice(
      $._type,
      $.varray_size_specifier
    ),

    generic_type: $ => prec.left(PRECS.type + 1, seq(
      field('name', $.identifier),
      field('arguments', $.type_argument_clause)
    )),

    generic_parameter_clause: $ => prec(2, seq(
      '<',
      sep1(',', $._generic_argument),
      '>'
    )),
    //
    // generic_expression: $ => prec(PRECS.comparison + 1, seq(
    //   field('name', choice($.identifier, $.scoped_type_identifier)),
    //   field('type_arguments', $.type_argument_clause)
    // )),

    // array part 
    array_literal: $ => seq(
      '[',
      optional($._array_elements),
      ']'
    ),

    _array_elements: $ => sep1(
      ',',
      field('element', $._expression),
    ),

    varray_size_specifier: $ => token(/\$[0-9]+/),

    // 后缀表达式 (规约 4.13)
    postfix_expression: $ => choice(
      // 带泛型的函数调用
      // 匹配 myFunc<T>()
      prec.left(PRECS.call, seq(
        field('function', $._expression),
        field('type_arguments', $.type_argument_clause), // <T>
        field('arguments', $.argument_list)              // ()
      )),
      // 匹配 f()
      prec.left(PRECS.call, seq(
        field('function', $._expression),
        field('arguments', $.argument_list)
      )),
      // 索引访问
      prec.left(PRECS.postfix_operations, seq(
        field('array', $._expression),
        '[',
        sep(',', $._expression),
        ']'
      )),
      // 成员访问
      prec.left(PRECS.postfix_operations, seq(
        field('object', $._expression),
        '.',
        field('property', $.identifier)
      )),
    ),

    argument_list: $ => seq(
      '(',
      sep(',', $._expression),
      ')'
    ),

    call_argument: $ =>
      seq(
        field("value", $._expression)
      ),

    // 括号表达式 (规约 4.12)
    unit_expression: $ => prec(0, seq('(', ')')),
    // 只处理单个表达式，优先级更高
    // (a + b )
    parenthesized_expression: $ => prec(1, seq(
      '(',
      $._expression,
      ')'
    )),

    // 只处理包含逗号的元组
    // (a , b )
    tuple_expression: $ => prec(0, seq(
      '(',
      $._expression,
      ',',
      sep(',', $._expression),
      ')'
    )),



    // 一元表达式 (规约 4.15, 4.18, 4.20)
    unary_expression: $ => prec.right(12, seq(
      choice('!', '-'),
      $._expression
    )),


    // 二元表达式
    binary_expression: ($) =>
      choice(
        $.multiplicative_expression,
        $.additive_expression,
        $.range_expression,
        $.infix_expression,
        $.nil_coalescing_expression,
        $.check_expression,
        $.equality_expression,
        $.comparison_expression,
        $.conjunction_expression,
        $.disjunction_expression,
        $.bitwise_operation
      ),



    multiplicative_expression: ($) =>
      prec.left(
        PRECS.multiplication,
        seq(
          field("lhs", $._expression),
          field("op", $._multiplicative_operator),
          field("rhs", $._expression)
        )
      ),
    additive_expression: ($) =>
      prec.left(
        PRECS.addition,
        seq(
          field("lhs", $._expression),
          field("op", $._additive_operator),
          field("rhs", $._expression)
        )
      ),
    range_expression: ($) =>
      prec.right(
        PRECS.range,
        seq(
          field("start", $._expression),
          field("op", $._range_operator),
          field("end", $._expr_hack_at_ternary_binary_suffix)
        )
      ),
    infix_expression: ($) =>
      prec.left(
        PRECS.infix_operations,
        seq(
          field("lhs", $._expression),
          field("op", $.custom_operator),
          field("rhs", $._expr_hack_at_ternary_binary_suffix)
        )
      ),
    nil_coalescing_expression: ($) =>
      prec.right(
        PRECS.nil_coalescing,
        seq(
          field("value", $._expression),
          $._nil_coalescing_operator,
          field("if_nil", $._expr_hack_at_ternary_binary_suffix)
        )
      ),
    check_expression: ($) =>
      prec.left(
        PRECS.check,
        seq(
          field("target", $._expression),
          field("op", $._is_operator),
          field("type", $._type)
        )
      ),
    comparison_expression: ($) =>
      prec.left(
        PRECS.comparison,
        seq(
          field("lhs", $._expression),
          field("op", choice('<', '>', '<=', '>=',)),
          field("rhs", $._expr_hack_at_ternary_binary_suffix)
        )
      ),
    equality_expression: ($) =>
      prec.left(
        PRECS.equality,
        seq(
          field("lhs", $._expression),
          field("op", $._equality_operator),
          field("rhs", $._expr_hack_at_ternary_binary_suffix)
        )
      ),
    conjunction_expression: ($) =>
      prec.left(
        PRECS.conjunction,
        seq(
          field("lhs", $._expression),
          field("op", $._conjunction_operator),
          field("rhs", $._expr_hack_at_ternary_binary_suffix)
        )
      ),
    disjunction_expression: ($) =>
      prec.left(
        PRECS.disjunction,
        seq(
          field("lhs", $._expression),
          field("op", $._disjunction_operator),
          field("rhs", $._expr_hack_at_ternary_binary_suffix)
        )
      ),
    bitwise_operation: ($) =>
      prec.left(
        PRECS.infix_operations - 1,
        seq(
          field("lhs", $._expression),
          field("op", $._bitwise_binary_operator),
          field("rhs", $._expr_hack_at_ternary_binary_suffix)
        )
      ),
    custom_operator: ($) => choice(token(/[\/]+[*]+/), $._custom_operator),
    _pattern: $ => choice(
      $.identifier,
      $.tuple_pattern,
    ),

    variable_declaration: $ => seq(
      choice('let', 'var', 'const'),
      field('name', $._pattern),
      optional(field('type', $.type_annotation)),
      optional(field('value', $.initializer)),
      optional(';')
    ),

    initializer: $ => seq('=', $._expression),


    type_annotation: $ => seq(':', $._type),


    _type: $ => choice(
      $.primitive_type,
      $.function_type,
      $.generic_type,
      $.tuple_type,
      $.scoped_type_identifier,
      $.identifier,
    ),

    primitive_type: $ => choice(
      'Bool', 'Rune', 'String', 'Unit', 'Nothing', 'This',
      'Int8', 'Int16', 'Int32', 'Int64', 'IntNative',
      'UInt8', 'UInt16', 'UInt32', 'UInt64', 'UIntNative',
      'Float16', 'Float32', 'Float64'
    ),


    // 元组类型 (规约 2.1.7)
    tuple_pattern: $ => seq(
      '(',
      sep1(',', $._pattern),
      ')'
    ),

    // 函数类型 (规约 2.1.9)
    function_type: $ => seq(
      field('parameters', $.parameter_types),
      '->',
      field('return_type', $._type)
    ),

    parameter_declaration: $ => seq(
      field('name', $._pattern),
      ':',
      field('type', $._type)
    ),
    parameter_types: $ => seq(
      '(',
      sep(',', $._type),
      ')'
    ),

    function_declaration: $ => seq(
      // TODO: 添加修饰符，如 'public', 'static' 等
      'func',
      field('name', $.identifier),
      // TODO: 添加泛型参数 <T>
      field('parameters', $.parameter_list),
      optional(field('return_type', $.type_annotation)),
      // TODO: 添加 where 约束
      field('body', $.block)
    ),

    parameter_list: $ => seq(
      '(',
      sep(',', $.parameter_declaration),
      ')'
    ),
    call_suffix: ($) =>
      prec(
        PRECS.call_suffix,
        choice(
          $.argument_list,
          // prec.dynamic(-1, $._fn_call_lambda_arguments),
          // seq($.value_arguments, $._fn_call_lambda_arguments)
        )
      ),

    // 函数体/代码块
    block: $ => seq(
      '{',
      repeat(choice(
        $._declaration,
        $._expression_statement
      )),
      '}'
    ),

    _expression_statement: $ => seq(
      $._expression,
      optional(';')
    ),


    // --- 词法规则 (Tokens) ---

    comment: $ => token(choice(
      seq('//', /[^\n\r]*/),
      seq('/*', /([^*]|\*+[^*/])*/, '*/')
      // seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')
    )),


    identifier: ($) =>
      choice(
        LEXICAL_IDENTIFIER,
        /`[^\r\n` ]*`/,       // leave checking work for compiler  
        // /\$[0-9]+/,        // conflict with $N, shall we name variable start with `$` ?
      ),

    _basic_literal: ($) =>
      choice(
        $.integer_literal,
        $.hex_literal,
        $.oct_literal,
        $.bin_literal,
        $.real_literal,
        $.boolean_literal,
        $._string_literal,
        $.rune_literal,
        $.regex_literal,
      ),
    real_literal: ($) =>
      token(
        choice(
          seq(DEC_DIGITS, REAL_EXPONENT),
          seq(optional(DEC_DIGITS), ".", DEC_DIGITS, optional(REAL_EXPONENT)),
          seq(
            "0x",
            HEX_DIGITS,
            optional(seq(".", HEX_DIGITS)),
            HEX_REAL_EXPONENT
          )
        )
      ),
    integer_literal: ($) => token(seq(optional(/[1-9]/), DEC_DIGITS)),
    hex_literal: ($) => token(seq("0", /[xX]/, HEX_DIGITS)),
    oct_literal: ($) => token(seq("0", /[oO]/, OCT_DIGITS)),
    bin_literal: ($) => token(seq("0", /[bB]/, BIN_DIGITS)),
    boolean_literal: ($) => choice("true", "false"),
    // String literals
    _string_literal: ($) =>
      choice(
        $.line_string_literal,
        $.multi_line_string_literal,
        $.raw_string_literal
      ),
    rune_literal: $ => token(seq(
      'r',
      choice(
        seq("'", choice(/[^'\\]/, ESCAPE_SEQUENCE), "'"),
        seq('"', choice(/[^"\\]/, ESCAPE_SEQUENCE), '"')
      )
    )),
    line_string_literal: ($) =>
      seq(
        '"',
        repeat(choice(field("text", $._line_string_content), $._interpolation)),
        '"'
      ),
    _line_string_content: ($) => choice($.line_str_text, $.str_escaped_char),
    line_str_text: ($) => /[^\\"]+/,
    str_escaped_char: ($) =>
      choice($._escaped_identifier, $._uni_character_literal),
    _uni_character_literal: ($) => seq("\\", "u", /\{[0-9a-fA-F]+\}/),
    multi_line_string_literal: ($) =>
      seq(
        '"""',
        repeat(
          choice(field("text", $._multi_line_string_content), $._interpolation)
        ),
        '"""'
      ),
    raw_string_literal: ($) =>
      seq(
        repeat(
          seq(
            field("text", $.raw_str_part),
            field("interpolation", $.raw_str_interpolation),
            optional($.raw_str_continuing_indicator)
          )
        ),
        field("text", $.raw_str_end_part)
      ),
    raw_str_interpolation: ($) =>
      seq($.raw_str_interpolation_start, $._interpolation_contents, ")"),
    raw_str_interpolation_start: ($) => /\\#*\(/,
    _multi_line_string_content: ($) =>
      choice($.multi_line_str_text, $.str_escaped_char, '"'),
    _interpolation: ($) => seq("\\(", $._interpolation_contents, ")"),
    _interpolation_contents: ($) =>
      sep1(
        field(
          "interpolation",
          alias($.call_argument, $.interpolated_expression)
        ),
        ","
      ),
    _escaped_identifier: ($) => /\\[0\\tnr"'\n]/,
    multi_line_str_text: ($) => /[^\\"]+/,
    regex_literal: ($) =>
      choice(
        $._extended_regex_literal,
        $._multiline_regex_literal,
        $._oneline_regex_literal
      ),

    _extended_regex_literal: ($) =>
      seq($._hash_symbol, /\/((\/[^#])|[^\n])+\/#/),

    _multiline_regex_literal: ($) =>
      seq($._hash_symbol, /\/\n/, /(\/[^#]|[^/])*?\n\/#/),

    _oneline_regex_literal: ($) =>
      token(
        prec(
          PRECS.regex,
          seq(
            "/",
            token.immediate(/[^ \t\n]?[^/\n]*[^ \t\n/]/),
            token.immediate("/")
          )
        )
      ),

    _multiplicative_operator: ($) =>
      choice("*", alias(token(prec(PRECS.regex, "/")), "/"), "%"),

    _assignment_and_operator: ($) =>
      choice("+=", "-=", "*=", "/=", "%=", $._equal_sign),
    _equality_operator: ($) => choice("!=", "!==", $._eq_eq, "==="),
    _comparison_operator: ($) => choice("<", ">", "<=", ">="),
    _three_dot_operator: ($) => alias("...", "..."), // Weird alias to satisfy highlight queries
    _open_ended_range_operator: ($) => alias("..<", "..<"),
    _is_operator: ($) => "is",
    _range_operator: ($) =>
      choice($._open_ended_range_operator, $._three_dot_operator),
    open_end_range_expression: ($) =>
      prec.right(
        PRECS.range,
        seq(field("start", $._expression), $._three_dot_operator)
      ),
    _additive_operator: ($) =>
      choice(
        alias($._plus_then_ws, "+"),
        alias($._minus_then_ws, "-"),
        "+",
        "-"
      ),

    _expr_hack_at_ternary_binary_suffix: ($) =>
      prec.left(
        PRECS.ternary_binary_suffix,
        choice(
          $._expression,
          alias($.expr_hack_at_ternary_binary_call, $.call_expression)
        )
      ),
    expr_hack_at_ternary_binary_call: ($) =>
      seq(
        $._expression,
        alias($.expr_hack_at_ternary_binary_call_suffix, $.call_suffix)
      ),
    expr_hack_at_ternary_binary_call_suffix: ($) =>
      prec(PRECS.call_suffix, $.argument_list),
    call_expression: ($) =>
      prec(
        PRECS.call,
        prec.dynamic(DYNAMIC_PRECS.call, seq($._expression, $.call_suffix))
      ),

    _bitwise_binary_operator: ($) => choice("&", "|", "^", "<<", ">>"),
    _postfix_unary_operator: ($) => choice("++", "--", $.bang),
    directly_assignable_expression: ($) => $._expression,
  }
});
