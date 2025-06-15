# flake.nix
{
  description = "A flake for developing the tree-sitter-cangjie parser";

  # 输入：我们依赖 Nix 包集合
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  # 输出：定义我们的包、开发环境等
  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        # 获取当前系统的 Nix 包集合
        pkgs = nixpkgs.legacyPackages.${system};

        # 我们需要的构建工具
        buildInputs = [
          pkgs.nodejs_20 # Node.js (用于 tree-sitter-cli)
          pkgs.gcc        # C/C++ 编译器 (用于构建解析器)
        ];
        
        # Tree-sitter CLI 的包定义
        tree-sitter-cli = pkgs.runCommand "tree-sitter-cli-cangjie" {
          nativeBuildInputs = [ pkgs.nodejs_20 ];
        } ''
          mkdir -p $out/bin
          npm install -g tree-sitter-cli --prefix $out
          # 确保 tree-sitter-cli 可以找到 node
          patchelf --set-interpreter "$(cat $NIX_CC/nix-support/dynamic-linker)" $out/bin/node
          wrapProgram $out/bin/tree-sitter --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.nodejs_20 ]}
        '';

      in
      {
        # 定义一个开发环境
        # 使用 `nix develop` 命令进入
        devShells.default = pkgs.mkShell {
          name = "tree-sitter-cangjie-dev";
          
          # 开发环境中可用的包
          packages = buildInputs ++ [ tree-sitter-cli ];

          # 进入 shell 时执行的命令
          # 这是实现自动化的关键！
          shellHook = ''
            echo "🌳 Welcome to the Tree-sitter Cangjie dev environment!"
            echo "   - Running 'tree-sitter generate' automatically..."

            # 每次进入 shell，都检查并重新生成解析器
            tree-sitter generate

            # 提供一个简单的别名来运行测试
            alias just-test='tree-sitter test'

            echo "   - Alias 'just-test' is available to run tests."
            echo "   - Environment is ready."
          '';
        };
      });
}
