// Uzum Market — savdo hisoboti (C++).
// server.py har bir buyurtmani data/orders.csv ga yozadi, bu dastur uni tahlil qiladi.
//
// Kompilyatsiya:  g++ -std=c++17 -O2 -static tools/report.cpp -o tools/report
// Ishga tushirish: tools/report            (yoki: tools/report data/orders.csv)

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

struct Order {
    std::string email, product, category;
    long long price = 0;
    int qty = 0;
};

// CSV qatorini bo'lish (qo'shtirnoq ichidagi vergullarni hisobga oladi)
std::vector<std::string> splitCsv(const std::string& line) {
    std::vector<std::string> out;
    std::string cur;
    bool quoted = false;
    for (size_t i = 0; i < line.size(); ++i) {
        char c = line[i];
        if (c == '"') {
            if (quoted && i + 1 < line.size() && line[i + 1] == '"') { cur += '"'; ++i; }
            else quoted = !quoted;
        } else if (c == ',' && !quoted) { out.push_back(cur); cur.clear(); }
        else if (c != '\r') cur += c;
    }
    out.push_back(cur);
    return out;
}

std::string money(long long n) {
    std::string s = std::to_string(n), r;
    int k = 0;
    for (int i = (int)s.size() - 1; i >= 0; --i) {
        r.insert(r.begin(), s[i]);
        if (++k % 3 == 0 && i > 0) r.insert(r.begin(), ' ');
    }
    return r + " so'm";
}

int main(int argc, char** argv) {
    std::string path = argc > 1 ? argv[1] : "data/orders.csv";
    std::ifstream in(path);
    if (!in) {
        std::cerr << "Fayl topilmadi: " << path << "\n(avval server.py ni ishga tushirib, xarid qiling)\n";
        return 1;
    }

    std::vector<Order> orders;
    std::string line;
    std::getline(in, line);  // sarlavha
    while (std::getline(in, line)) {
        auto f = splitCsv(line);
        if (f.size() < 6) continue;
        orders.push_back({f[1], f[2], f[3], std::stoll(f[4]), std::stoi(f[5])});
    }

    long long total = 0;
    std::map<std::string, long long> byCategory, byUser;
    std::map<std::string, int> byProduct;
    for (const auto& o : orders) {
        long long sum = o.price * o.qty;
        total += sum;
        byCategory[o.category] += sum;
        byUser[o.email] += sum;
        byProduct[o.product] += o.qty;
    }

    std::cout << "===== UZUM MARKET HISOBOTI =====\n";
    std::cout << "Buyurtmalar soni : " << orders.size() << "\n";
    std::cout << "Umumiy savdo     : " << money(total) << "\n\n";

    std::cout << "-- Bo'limlar bo'yicha --\n";
    for (const auto& [cat, sum] : byCategory)
        std::cout << "  " << std::left << std::setw(10) << cat << money(sum) << "\n";

    std::vector<std::pair<std::string, int>> top(byProduct.begin(), byProduct.end());
    std::sort(top.begin(), top.end(), [](auto& a, auto& b) { return a.second > b.second; });
    std::cout << "\n-- Eng ko'p sotilgan (top 5) --\n";
    for (size_t i = 0; i < top.size() && i < 5; ++i)
        std::cout << "  " << i + 1 << ". " << top[i].first << " — " << top[i].second << " dona\n";

    std::cout << "\n-- Xaridorlar --\n";
    for (const auto& [email, sum] : byUser)
        std::cout << "  " << email << " : " << money(sum) << "\n";
    return 0;
}
