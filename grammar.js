const ESCAPE_SEQUENCE = token.immediate(seq(
  '\\',
  choice(
    /[^xu]/,
    /u[0-9a-fA-F]{4}/,
    /u\{[0-9a-fA-F]+\}/
  )
));

function sepBy(sep, rule) {
  return optional(sepBy1(sep, rule));
}

function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}

module.exports = grammar({
  name: 'cangjie',

  extras: $ => [
    /\s/,       // 匹配空白字符
    $.comment,  // 匹配注释
  ],

  supertypes: $ => [
    $._expression,
    $._declaration,
    $._pattern,
    $._type,
    $._atomic_expression,
  ],

  rules: {
    source_file: $ => repeat($._declaration),

    _declaration: $ => choice(
      $.variable_declaration,
      $.function_declaration
    ),


    _atomic_expression: $ => choice(
      $.parenthesized_expression,
      $.identifier,
      $.integer_literal,
      $.string_literal,
      $.boolean_literal,
      $.rune_literal
    ),

    _expression: $ => choice(
      $._atomic_expression,
      $.unary_expression,
      $.binary_expression,
      $.postfix_expression
    ),

    // 后缀表达式 (规约 4.13)
    postfix_expression: $ => prec(13, choice(
      // 函数调用 f()
      seq(
        field('function', $._expression),
        field('arguments', $.argument_list)
      ),
      // 索引访问 a[i]
      seq(
        field('array', $._expression),
        '[',
        sepBy(',', $._expression),
        ']'
      ),
      // 成员访问 obj.prop
      seq(
        field('object', $._expression),
        '.',
        field('property', $.identifier)
      )
    )),

    argument_list: $ => seq(
      '(',
      sepBy(',', $._expression), // sepBy 是一个辅助函数
      ')'
    ),


    // 括号表达式 (规约 4.12)
    parenthesized_expression: $ => seq(
      '(',
      $._expression,
      ')'
    ),



    // 一元表达式 (规约 4.15, 4.18, 4.20)
    unary_expression: $ => prec.right(12, seq(
      choice('!', '-'),
      $._expression
    )),


    // 二元表达式
    binary_expression: $ => {
      const table = [
        [prec.right, '??', 0],
        [prec.left, '||', 1],
        [prec.left, '&&', 2],
        [prec.left, '|', 3],
        [prec.left, '^', 4],
        [prec.left, '&', 5],
        [prec.left, choice('==', '!=', '<', '<=', '>', '>=', 'is', 'as'), 6],
        [prec.left, choice('..', '..='), 7],
        [prec.left, choice('<<', '>>'), 8],
        [prec.left, choice('+', '-'), 9],
        [prec.left, choice('*', '/', '%'), 10],
        [prec.right, '**', 11],
      ];

      return choice(...table.map(([assoc, operator, precedence]) =>
        assoc(precedence, seq(
          field('left', $._expression),
          field('operator', operator),
          field('right', $._expression)
        ))
      ));
    },

    _pattern: $ => $.identifier,

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
      $.tuple_type,
      $.function_type,
      $.identifier
    ),

    primitive_type: $ => token(choice(
      'Bool', 'Rune', 'String', 'Unit', 'Nothing', 'This',
      'Int8', 'Int16', 'Int32', 'Int64', 'IntNative',
      'UInt8', 'UInt16', 'UInt32', 'UInt64', 'UIntNative',
      'Float16', 'Float32', 'Float64'
    )),


    // 元组类型 (规约 2.1.7)
    tuple_type: $ => seq(
      '(',
      sepBy1(',', $._type),
      ')'
    ),

    // 函数类型 (规约 2.1.9)
    function_type: $ => seq(
      field('parameters', $.parameter_types),
      '->',
      field('return_type', $._type)
    ),

    parameter_declaration: $ => seq(
      field('name', $._pattern), // 修复：参数名可以是模式
      ':',
      field('type', $._type)
    ),
    parameter_types: $ => seq(
      '(',
      sepBy(',', $._type),
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
      sepBy(',', $.parameter_declaration),
      ')'
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
      seq('/*', repeat(choice(/[^*]+/, /\*[^/]/)), '*/')
    )),

    identifier: $ => token(choice(
      seq(/\p{XID_Start}/, /\p{XID_Continue}*/),
      seq('_', /\p{XID_Continue}+/),
      seq('`', choice(/\p{XID_Start}/, '_'), /\p{XID_Continue}*/, '`')
    )),

    integer_literal: $ => token(seq(
      choice(
        /0[bB][01_]+/,
        /0[oO][0-7_]+/,
        /\d[\d_]*/,
        /0[xX][\da-fA-F_]+/
      ),
      optional(/i8|i16|i32|i64|u8|u16|u32|u64/)
    )),

    boolean_literal: $ => token(choice('true', 'false')),

    escape_sequence: $ => token.immediate(seq(
      '\\',
      choice(
        /[^xu]/,
        /u[0-9a-fA-F]{4}/,
        /u\{[0-9a-fA-F]+\}/
      )
    )),

    string_literal: $ => choice(
      seq(
        '"',
        repeat(choice(
          $._string_content_double,
          ESCAPE_SEQUENCE, // <--- 使用常量
          $.string_interpolation
        )),
        '"'
      ),
      seq(
        '"""',
        repeat(choice(
          token.immediate(prec(1, /[^"$\\]+/)),
          $.escape_sequence,
          $.string_interpolation
        )),
        '"""'
      ),
      /r#".*?"#r/
    ),

    string_interpolation: $ => seq('${', $._expression, '}'),
    _string_content_double: $ => token.immediate(prec(1, /[^"$\\]+/)),

    rune_literal: $ => token(seq(
      'r',
      choice(
        seq("'", choice(/[^'\\]/, ESCAPE_SEQUENCE), "'"),
        seq('"', choice(/[^"\\]/, ESCAPE_SEQUENCE), '"')
      )
    )),
  }
});
