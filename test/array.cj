// 数组字面量
let emptyArr1 = Array<Int64>()
let array3 = [0, 2, 4]
let array4 = ["0", "1"]

// 嵌套数组
let array6 = [[0.1, 0.2], [0.3, 0.4]]

// 变量声明中使用泛型数组类型
let intArray: Array<Int32> = [0, 1, 2, 3, 4]

// 在函数参数中使用
func process(data: Array<String>) {
  return 0;
}

let arr1: VArray<Int64, $5> = [1, 2, 3, 4, 5]
let arr2: VArray<Int16, $0> = []

// 在函数签名中使用
func mergeVArray(a: VArray<Int64, $2>, b: VArray<Int64, $3>): VArray<Int64, $5> {
  return 0;
}

// 多维 VArray
var arr8: VArray<VArray<Int64, $2>, $2> = [[1, 2], [3, 4]]
