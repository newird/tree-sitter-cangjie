# flake.nix (修正版)
{
  description = "A flake for developing the tree-sitter-cangjie parser";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        # 获取当前系统的 Nix 包集合
        pkgs = nixpkgs.legacyPackages.${system};

      in
      {
        # 定义一个开发环境
        # 使用 `nix develop` 命令进入
        devShells.default = pkgs.mkShell {
          name = "tree-sitter-cangjie-dev";

          # 开发环境中可用的包
          # 我们直接使用 nixpkgs 提供的 tree-sitter，而不是自己构建
          packages = [
            pkgs.tree-sitter  # Tree-sitter CLI
            pkgs.nodejs_20    # 用于运行 JS 测试
            pkgs.bun          # Bun 运行时 (如果你的项目需要)
            pkgs.gcc          # C 编译器，'tree-sitter generate' 需要
            pkgs.cacert       # SSL 证书，用于网络访问
          ];

          shellHook = ''
            export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"

            echo "🌳 Welcome to the Tree-sitter Cangjie dev environment!"
            echo "   - Running 'tree-sitter generate' automatically..."

            # 每次进入 shell，都检查并重新生成解析器
            # tree-sitter generate 需要 C 编译器 (gcc)
            tree-sitter generate

            # 提供一个简单的别名来运行测试
            # tree-sitter test 需要 Node.js
            alias rr='tree-sitter generate'
            alias just-test='tree-sitter generate & tree-sitter test'
            alias just-parse='tree-sitter generate &tree-sitter parse'

            echo "   - Alias 'just-test' is available to run tests."
            echo "   - Alias 'just-parse file' is available to run parse source code."
            echo "   - Environment is ready."
          '';
        };
      });
}
